import { auth, registrarInteraccionesCallable } from "./firebase";

/**
 * Medición ligera de cómo se usa el portal (tienda y asesor), siempre
 * activa: para saber dónde se atoran al subir un documento o al validar
 * un código en caja, qué pantallas usan y cuánto, qué tocan esperando que
 * pase algo, qué errores ven y cuánto tiempo pasan sin señal — sin tener
 * que preguntarles. Lo lee Aviva en el panel, "Uso del portal".
 *
 * Qué registra:
 * - pantallas y tiempo en cada una. Solo cuenta mientras la pestaña está a
 *   la vista y hasta 2 min después del último toque o tecla: la tablet de
 *   la caja que se queda todo el día en "Validar código" no suma horas. Un
 *   rato de uso continuo se parte cada 10 min.
 * - cada toque (posición y qué se tocó), los de frustración (3 o más en
 *   1 s en el mismo lugar) y los que caen en algo que no es botón;
 * - errores de la página y cortes de señal;
 * - los pasos de subir cotización, subir comprobante y validar el código
 *   del cliente en caja (y de la cámara), para los embudos.
 *
 * Sin datos personales: de un campo solo se guarda cuál es, nunca lo
 * escrito; lo que está marcado `data-privado` (nombres de clientes, el
 * archivo elegido) nunca se usa como etiqueta; los toques fuera de un
 * botón se nombran por zona ("Sin botón · Tabla de clientes"), y a todo
 * texto se le quitan los números.
 *
 * Funciona sin señal: los eventos se guardan en el equipo y se mandan en
 * lotes cada minuto. La identidad la pone el servidor con el token; cada
 * evento guardado lleva el uid de quien lo generó, para que en una caja
 * compartida no se manden a nombre de quien entre después.
 *
 * Copia del esquema de eventos en functions/src/uso/eventos.ts.
 */

export type Flujo = "cotizacion" | "comprobante" | "vale" | "camara";
export type Dispositivo = "celular" | "tablet" | "escritorio";

type Evento =
  | { t: "pantalla"; p: string; ms: number; en: number }
  | { t: "toque"; p: string; x: number; y: number; w: number; e: string; sb?: true; en: number }
  | { t: "frustracion"; p: string; x: number; y: number; w: number; e: string; n: number; en: number }
  | { t: "error"; p: string; m: string; en: number }
  | { t: "senal"; ms: number; en: number }
  | { t: "paso"; f: Flujo; s: string; d?: string; p: string; en: number };

interface Guardado {
  /** id local, para quitarlo de la cola una vez mandado. */
  i: string;
  /** uid de quien lo generó. */
  u: string;
  /** sesión */
  s: string;
  d: Dispositivo;
  e: Evento;
}

const CLAVE_COLA = "paydesk_uso_cola_v1";
const CLAVE_SESION = "paydesk_uso_sesion_v1";
const CLAVE_SIN_SENAL = "paydesk_uso_sin_senal_v1";
/** Pedazos de grabación que no se han podido subir (ver grabacion.ts). */
export const CLAVE_PENDIENTES_GRABACION = "paydesk_grabacion_pendientes_v1";
const MAX_COLA = 1500;
const MAX_LOTE = 400;
const CADA_MS = 60_000;
const SESION_INACTIVA_MS = 30 * 60_000;
const GRACIA_MS = 2 * 60_000;
const TRAMO_MAX_MS = 10 * 60_000;
const VIEJO_MS = 7 * 86_400_000;

// --- Funciones puras (probadas en web/test/analitica.test.ts) ---

/** Sin correos ni números, en una línea y corto. */
export function limpiarTexto(texto: string, max = 60): string {
  return texto
    .replace(/[^\s@]+@[^\s@]+/g, "[correo]")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const RUTAS: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/^\/solicitudes\/?$/, "Mis clientes"],
  [/^\/solicitudes\/validar\/?$/, "Validar código"],
  [/^\/solicitudes\/canceladas\/?$/, "Canceladas"],
  [/^\/solicitudes\/reporte\/?$/, "Reporte"],
  [/^\/solicitudes\/aprende\/?$/, "Aprende"],
  [/^\/solicitudes\/aprende\/guia-rapida\/?$/, "Aprende · Guía rápida"],
  [/^\/solicitudes\/aprende\/([\w-]+)\/?$/, (m) => `Aprende · ${m[1]}`],
  [/^\/consulta\/?$/, "Asesor · Clientes"],
  [/^\/consulta\/aprende\/?$/, "Asesor · Aprende"],
  [/^\/consulta\/aprende\/([\w-]+)\/?$/, (m) => `Asesor · Aprende · ${m[1]}`],
];

/** El nombre de la pantalla para el panel. Los ids de lección no son datos personales. */
export function nombrePantalla(ruta: string): string {
  for (const [re, nombre] of RUTAS) {
    const m = ruta.match(re);
    if (m) return typeof nombre === "string" ? nombre : nombre(m);
  }
  return "Otra";
}

/** La capacitación tiene simuladores con los formularios reales: lo que pasa ahí no es uso real. */
export function esPractica(pantalla: string): boolean {
  return pantalla.startsWith("Aprende") || pantalla.startsWith("Asesor · Aprende");
}

export function dispositivoPorAncho(ancho: number): Dispositivo {
  if (ancho < 640) return "celular";
  if (ancho < 1024) return "tablet";
  return "escritorio";
}

/**
 * Toques de frustración: 3 o más en 1 s a menos de 40 px uno de otro. Se
 * reporta una sola vez por ráfaga, cuando termina, con cuántos fueron.
 */
export class DetectorFrustracion {
  private recientes: { x: number; y: number; en: number }[] = [];
  private rafaga: { x: number; y: number; n: number; ultimo: number; e: string } | null = null;

  constructor(
    private readonly ventanaMs = 1000,
    private readonly radio = 40,
    private readonly minimo = 3,
  ) {}

  /** Anota un toque. Devuelve la ráfaga anterior si este toque ya no es parte de ella. */
  tocar(x: number, y: number, en: number, e: string): { x: number; y: number; n: number; e: string } | null {
    let terminada: { x: number; y: number; n: number; e: string } | null = null;
    if (this.rafaga) {
      const cerca = Math.hypot(x - this.rafaga.x, y - this.rafaga.y) <= this.radio;
      if (cerca && en - this.rafaga.ultimo <= this.ventanaMs) {
        this.rafaga.n += 1;
        this.rafaga.ultimo = en;
        return null;
      }
      terminada = this.cerrar();
    }
    this.recientes = this.recientes.filter((r) => en - r.en <= this.ventanaMs);
    this.recientes.push({ x, y, en });
    const vecinos = this.recientes.filter((r) => Math.hypot(x - r.x, y - r.y) <= this.radio);
    if (vecinos.length >= this.minimo) {
      this.rafaga = { x, y, n: vecinos.length, ultimo: en, e };
      this.recientes = [];
    }
    return terminada;
  }

  /** La ráfaga en curso si ya pasó su ventana (o si se fuerza, al salir). */
  vencida(ahora: number, forzar = false): { x: number; y: number; n: number; e: string } | null {
    if (!this.rafaga) return null;
    if (!forzar && ahora - this.rafaga.ultimo <= this.ventanaMs) return null;
    return this.cerrar();
  }

  private cerrar() {
    const r = this.rafaga!;
    this.rafaga = null;
    return { x: r.x, y: r.y, n: r.n, e: r.e };
  }
}

/** Por qué no se pudo subir un documento, en las categorías del panel. */
export function motivoDeError(err: unknown, enLinea = navigator.onLine): string {
  const mensaje = err instanceof Error ? err.message : String(err);
  if (!enLinea || /failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)) {
    return "sin-senal";
  }
  if (/sesi[oó]n expir/i.test(mensaje)) return "sesion";
  if (/demasiados intentos/i.test(mensaje)) return "limite";
  return "servidor";
}

// --- Etiquetas de lo que se tocó (necesitan el DOM) ---

const INTERACTIVO =
  "button, a[href], input, select, textarea, label, summary, [role=button], [role=tab], [role=link], [role=switch], [role=checkbox], [contenteditable=true]";

/** Partes del portal, de la más específica a la más general. `data-zona` manda sobre todas. */
const ZONAS: [string, string][] = [
  ["[data-zona]", ""],
  [".escaner", "Cámara"],
  [".vale-resultado", "Resultado del código"],
  [".validar", "Caja"],
  [".modal-panel", "Ventana"],
  ["thead", "Encabezados de la tabla"],
  ["table, .deals-table-wrapper", "Tabla de clientes"],
  [".filters", "Filtros"],
  [".summary, .callout-accion", "Resumen"],
  ["form", "Formulario"],
  [".app-bar, header", "Encabezado"],
  ["nav, .tabs", "Pestañas"],
  [".empty-state", "Lista vacía"],
];

export function zonaDe(el: Element): string {
  for (const [selector, nombre] of ZONAS) {
    const z = el.closest(selector);
    if (z) return nombre || limpiarTexto(z.getAttribute("data-zona") ?? "", 40) || "Página";
  }
  return "Página";
}

/** Texto visible de un elemento, sin lo que está dentro de `data-privado`. */
function textoVisible(el: Element): string {
  let texto = "";
  const recorrer = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) texto += n.textContent ?? "";
    else if (n instanceof Element && !n.hasAttribute("data-privado") && n.getAttribute("aria-hidden") !== "true") {
      n.childNodes.forEach(recorrer);
    }
  };
  el.childNodes.forEach(recorrer);
  return texto;
}

function nombreDeCampo(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  if (el instanceof HTMLInputElement && el.type === "file") return "Archivo";
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  const porId = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const label = porId ?? el.closest("label");
  const deLabel = label ? textoVisible(label) : "";
  if (deLabel.trim()) return deLabel;
  return el.getAttribute("placeholder") || el.getAttribute("name") || el.type || "sin nombre";
}

/**
 * Qué se tocó, para el panel. `null` si no es botón, liga ni campo.
 * Nunca lleva lo escrito en un campo ni lo marcado `data-privado`.
 */
export function etiquetaDe(objetivo: Element): { etiqueta: string; sinBoton: boolean } {
  const explicita = objetivo.closest("[data-analitica]");
  if (explicita) return { etiqueta: limpiarTexto(explicita.getAttribute("data-analitica") ?? ""), sinBoton: false };

  if (objetivo.classList.contains("modal-overlay")) {
    return { etiqueta: "Fuera de la ventana (la cierra)", sinBoton: false };
  }

  const el = objetivo.closest(INTERACTIVO);
  if (!el) return { etiqueta: `Sin botón · ${zonaDe(objetivo)}`, sinBoton: true };

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    return { etiqueta: limpiarTexto(`Campo · ${nombreDeCampo(el)}`), sinBoton: false };
  }
  if (el.tagName === "LABEL") {
    const campo = el.querySelector("input, select, textarea") as HTMLInputElement | null;
    if (campo) return { etiqueta: limpiarTexto(`Campo · ${nombreDeCampo(campo)}`), sinBoton: false };
  }
  if (el.closest("[data-privado]")) return { etiqueta: `Botón · ${zonaDe(el)}`, sinBoton: false };
  const texto = limpiarTexto(el.getAttribute("aria-label") || textoVisible(el) || el.getAttribute("title") || "");
  return { etiqueta: texto || `Botón sin texto · ${zonaDe(el)}`, sinBoton: false };
}

// --- Estado de la medición ---

interface Estado {
  uid: string;
  sesionId: string;
  dispositivo: Dispositivo;
  base: string;
  ventana: string | null;
  tramo: { p: string; inicio: number; ultima: number } | null;
  ultimaActividad: number;
  grabar: boolean | null;
  errores: Map<string, number>;
  erroresSesion: number;
  /** El último <label> tocado: el navegador repite ese clic en su campo, y ese no cuenta. */
  ultimaEtiqueta: { control: Element; en: number } | null;
  detector: DetectorFrustracion;
  timers: number[];
  quitar: (() => void)[];
  enviando: boolean;
}

let estado: Estado | null = null;
let detenerGrabacion: (() => void) | null = null;

function leerCola(): Guardado[] {
  try {
    const crudo = localStorage.getItem(CLAVE_COLA);
    return crudo ? (JSON.parse(crudo) as Guardado[]) : [];
  } catch {
    return [];
  }
}

function escribirCola(cola: Guardado[]) {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola.slice(-MAX_COLA)));
  } catch {
    // Sin espacio o almacenamiento bloqueado: se pierden eventos, no el portal.
  }
}

function idNuevo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** La sesión de esta pestaña; se renueva tras 30 min sin uso. */
function sesionDePestana(uid: string): string {
  const ahora = Date.now();
  try {
    const guardada = JSON.parse(sessionStorage.getItem(CLAVE_SESION) ?? "null") as
      | { id: string; uid: string; ultima: number }
      | null;
    if (guardada && guardada.uid === uid && ahora - guardada.ultima < SESION_INACTIVA_MS) {
      return guardada.id;
    }
  } catch {
    // sigue con una nueva
  }
  const id = idNuevo();
  tocarSesion(id, uid);
  return id;
}

function tocarSesion(id: string, uid: string) {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ id, uid, ultima: Date.now() }));
  } catch {
    // ignorado
  }
}

function pantallaClave(e: Estado): string {
  return e.ventana ? `${e.base} › ${e.ventana}` : e.base;
}

/** La pantalla que se ve ahora (con la ventana abierta, si hay). La usa la grabación. */
export function pantallaActual(): string {
  return estado ? pantallaClave(estado) : "";
}

let consecutivo = 0;

function anotar(ev: Evento) {
  const e = estado;
  if (!e) return;
  const cola = leerCola();
  consecutivo = (consecutivo + 1) % 1_000_000;
  cola.push({ i: `${Date.now().toString(36)}-${consecutivo}`, u: e.uid, s: e.sesionId, d: e.dispositivo, e: ev });
  escribirCola(cola);
}

function cerrarTramo(ahora = Date.now()) {
  const e = estado;
  if (!e?.tramo) return;
  const fin = Math.min(ahora, e.tramo.ultima + GRACIA_MS);
  const ms = Math.min(TRAMO_MAX_MS, Math.max(0, fin - e.tramo.inicio));
  if (ms >= 1000) anotar({ t: "pantalla", p: e.tramo.p, ms, en: e.tramo.inicio });
  e.tramo = null;
}

function abrirTramo(ahora = Date.now()) {
  const e = estado;
  if (!e || document.visibilityState !== "visible") return;
  e.tramo = { p: pantallaClave(e), inicio: ahora, ultima: ahora };
}

function actividad() {
  const e = estado;
  if (!e) return;
  const ahora = Date.now();
  if (!e.tramo) abrirTramo(ahora);
  else if (ahora - e.tramo.ultima > GRACIA_MS) {
    // Volvió después de un rato sin tocar nada: lo de en medio no cuenta.
    cerrarTramo(ahora);
    abrirTramo(ahora);
  } else e.tramo.ultima = ahora;
  // Escribir la sesión en cada tecla sobra: una vez cada 10 s alcanza.
  if (ahora - e.ultimaActividad > 10_000) tocarSesion(e.sesionId, e.uid);
  e.ultimaActividad = ahora;
}

function cambiarPantalla(mutar: (e: Estado) => void) {
  const e = estado;
  if (!e) return;
  const antes = pantallaClave(e);
  mutar(e);
  if (pantallaClave(e) === antes) return;
  cerrarTramo();
  abrirTramo();
}

/** La ruta cambió. La llama el layout de la tienda y el del asesor. */
export function cambiarRuta(ruta: string) {
  cambiarPantalla((e) => {
    e.base = nombrePantalla(ruta);
    e.ventana = null;
  });
}

/** Se abrió una ventana sobre la pantalla (subir cotización, validar código…). */
export function abrirVentana(nombre: string) {
  cambiarPantalla((e) => {
    e.ventana = nombre;
  });
}

export function cerrarVentana() {
  cambiarPantalla((e) => {
    e.ventana = null;
  });
}

/** Un paso de uno de los trabajos medidos. No hace nada fuera del portal (panel, capacitación). */
export function paso(f: Flujo, s: string, d?: string) {
  const e = estado;
  if (!e || esPractica(e.base)) return;
  anotar({ t: "paso", f, s, ...(d ? { d } : {}), p: pantallaClave(e), en: Date.now() });
}

/** Un error que la persona vio o que tronó en la página. Se repite a lo más una vez cada 10 s. */
export function registrarError(mensaje: string) {
  const e = estado;
  if (!e) return;
  const m = limpiarTexto(mensaje, 140);
  if (!m || /^ResizeObserver loop|^Script error\.?$/i.test(m)) return;
  const ahora = Date.now();
  if (ahora - (e.errores.get(m) ?? 0) < 10_000 || e.erroresSesion >= 50) return;
  e.errores.set(m, ahora);
  e.erroresSesion += 1;
  anotar({ t: "error", p: pantallaClave(e), m, en: ahora });
}

function anotarFrustracion(r: { x: number; y: number; n: number; e: string } | null) {
  const e = estado;
  if (!e || !r) return;
  anotar({ t: "frustracion", p: pantallaClave(e), x: r.x, y: r.y, w: window.innerWidth, e: r.e, n: r.n, en: Date.now() });
}

function alTocar(ev: MouseEvent) {
  const e = estado;
  // detail 0: clic de teclado (Enter o espacio sobre un botón).
  if (!e || ev.detail === 0 || !(ev.target instanceof Element)) return;
  const ahora = Date.now();
  // Tocar un <label> hace que el navegador mande otro clic a su campo: es el mismo toque.
  if (e.ultimaEtiqueta && e.ultimaEtiqueta.control === ev.target && ahora - e.ultimaEtiqueta.en < 500) {
    e.ultimaEtiqueta = null;
    return;
  }
  const label = ev.target.closest("label");
  e.ultimaEtiqueta = label?.control && label.control !== ev.target ? { control: label.control, en: ahora } : null;
  const { etiqueta, sinBoton } = etiquetaDe(ev.target);
  const x = Math.round(ev.pageX);
  const y = Math.round(ev.pageY);
  anotar({
    t: "toque",
    p: pantallaClave(e),
    x,
    y,
    w: window.innerWidth,
    e: etiqueta,
    ...(sinBoton ? { sb: true as const } : {}),
    en: ahora,
  });
  anotarFrustracion(e.detector.tocar(x, y, ahora, etiqueta));
}

function alCambiarVisibilidad() {
  const e = estado;
  if (!e) return;
  if (document.visibilityState === "hidden") {
    cerrarTramo();
    anotarFrustracion(e.detector.vencida(Date.now(), true));
    void enviar();
  } else {
    abrirTramo();
  }
}

function alPerderSenal() {
  try {
    sessionStorage.setItem(CLAVE_SIN_SENAL, String(Date.now()));
  } catch {
    // ignorado
  }
}

function alVolverSenal() {
  try {
    const desde = Number(sessionStorage.getItem(CLAVE_SIN_SENAL));
    sessionStorage.removeItem(CLAVE_SIN_SENAL);
    if (desde > 0) anotar({ t: "senal", ms: Date.now() - desde, en: desde });
  } catch {
    // ignorado
  }
  void enviar();
}

function vigilar() {
  const e = estado;
  if (!e) return;
  const ahora = Date.now();
  anotarFrustracion(e.detector.vencida(ahora));
  if (e.tramo) {
    if (ahora - e.tramo.ultima > GRACIA_MS) cerrarTramo(ahora);
    else if (ahora - e.tramo.inicio >= TRAMO_MAX_MS) {
      // Uso continuo largo: se parte en ratos de 10 min.
      cerrarTramo(ahora);
      abrirTramo(ahora);
    }
  }
}

function ahorroDeDatos(): boolean {
  return Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
}

async function decidirGrabacion(grabar: boolean) {
  const e = estado;
  if (!e || e.grabar === grabar) return;
  e.grabar = grabar;
  if (!grabar) {
    detenerGrabacion?.();
    detenerGrabacion = null;
    return;
  }
  if (ahorroDeDatos() || typeof CompressionStream === "undefined") return;
  // La librería de grabación solo se descarga en las sesiones que se graban.
  const { iniciarGrabacion } = await import("./grabacion");
  if (estado !== e || !e.grabar) return;
  detenerGrabacion = iniciarGrabacion({ uid: e.uid, sesionId: e.sesionId, dispositivo: e.dispositivo });
}

/**
 * Manda lo que haya de quien tiene la sesión abierta, por sesión, en
 * lotes. Si no hay nada de la sesión actual y todavía no se sabe si se
 * graba, manda un lote vacío solo para preguntarlo.
 */
async function enviar() {
  const e = estado;
  const user = auth.currentUser;
  if (!e || e.enviando || !user || user.uid !== e.uid || !navigator.onLine) return;
  e.enviando = true;
  try {
    const ahora = Date.now();
    // Lo de otra persona se guarda hasta que vuelva a entrar en este equipo, a lo más 7 días.
    escribirCola(leerCola().filter((g) => g.u === e.uid || ahora - g.e.en < VIEJO_MS));
    const mias = leerCola().filter((g) => g.u === e.uid);
    const sesiones = [...new Set(mias.map((g) => g.s))];
    if (e.grabar === null && !sesiones.includes(e.sesionId)) sesiones.push(e.sesionId);

    for (const s of sesiones) {
      const lote = mias.filter((g) => g.s === s).slice(0, MAX_LOTE);
      const { data } = await registrarInteraccionesCallable({
        sesionId: s,
        dispositivo: lote[0]?.d ?? e.dispositivo,
        ahora: Date.now(),
        eventos: lote.map((g) => g.e),
      });
      // Se quitan solo los que se mandaron: mientras tanto pudieron llegar otros.
      const mandados = new Set(lote.map((g) => g.i));
      escribirCola(leerCola().filter((g) => !mandados.has(g.i)));
      if (s === e.sesionId) void decidirGrabacion(data.grabar);
    }
  } catch {
    // Sin señal, sesión vencida o límite: se reintenta en el siguiente minuto.
  } finally {
    e.enviando = false;
  }
}

/**
 * Arranca la medición para quien tiene la sesión abierta. La llaman los
 * layouts de la tienda y del asesor; si ya está corriendo para la misma
 * persona, no hace nada.
 */
export function iniciarMedicion(ruta: string) {
  const user = auth.currentUser;
  if (!user) return;
  if (estado?.uid === user.uid) {
    cambiarRuta(ruta);
    return;
  }
  void detenerMedicion();

  const e: Estado = {
    uid: user.uid,
    sesionId: sesionDePestana(user.uid),
    dispositivo: dispositivoPorAncho(window.innerWidth),
    base: nombrePantalla(ruta),
    ventana: null,
    tramo: null,
    ultimaActividad: Date.now(),
    grabar: null,
    errores: new Map(),
    erroresSesion: 0,
    ultimaEtiqueta: null,
    detector: new DetectorFrustracion(),
    timers: [],
    quitar: [],
    enviando: false,
  };
  estado = e;
  abrirTramo();

  const escuchar = <K extends keyof WindowEventMap>(
    tipo: K,
    fn: (ev: WindowEventMap[K]) => void,
    opciones?: AddEventListenerOptions,
  ) => {
    window.addEventListener(tipo, fn, opciones);
    e.quitar.push(() => window.removeEventListener(tipo, fn, opciones));
  };
  const alError = (ev: ErrorEvent) => registrarError(ev.message || "Error en la página");
  const alRechazo = (ev: PromiseRejectionEvent) => {
    const r = ev.reason;
    registrarError(r instanceof Error ? r.message : typeof r === "string" ? r : "Promesa rechazada");
  };

  escuchar("click", alTocar, { capture: true, passive: true });
  escuchar("pointerdown", actividad, { capture: true, passive: true });
  escuchar("keydown", actividad, { capture: true, passive: true });
  escuchar("scroll", actividad, { capture: true, passive: true });
  escuchar("error", alError);
  escuchar("unhandledrejection", alRechazo);
  escuchar("offline", alPerderSenal);
  escuchar("online", alVolverSenal);
  document.addEventListener("visibilitychange", alCambiarVisibilidad);
  e.quitar.push(() => document.removeEventListener("visibilitychange", alCambiarVisibilidad));
  if (!navigator.onLine) alPerderSenal();

  e.timers.push(window.setInterval(vigilar, 15_000));
  e.timers.push(window.setInterval(() => void enviar(), CADA_MS));
  // Al abrir: lo que quedó guardado sin señal, y si esta sesión se graba.
  void enviar();
  // Pedazos de grabación de antes que no se alcanzaron a subir. Solo se
  // descarga la librería si de verdad hay alguno.
  try {
    if (localStorage.getItem(CLAVE_PENDIENTES_GRABACION)) {
      void import("./grabacion").then((m) => m.subirPendientes(user.uid)).catch(() => {});
    }
  } catch {
    // ignorado
  }
}

/**
 * Cierra el rato en pantalla y manda lo pendiente. Se llama antes de
 * "Salir", mientras el token todavía sirve; espera a lo más 2 s.
 */
export async function detenerMedicion() {
  const e = estado;
  if (!e) return;
  cerrarTramo();
  anotarFrustracion(e.detector.vencida(Date.now(), true));
  detenerGrabacion?.();
  detenerGrabacion = null;
  e.timers.forEach((t) => clearInterval(t));
  e.quitar.forEach((q) => q());
  await Promise.race([enviar(), new Promise((r) => setTimeout(r, 2000))]);
  if (estado === e) estado = null;
}
