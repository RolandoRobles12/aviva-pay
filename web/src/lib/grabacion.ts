import { auth, subirGrabacionCallable } from "./firebase";
import { CLAVE_PENDIENTES_GRABACION, pantallaActual, type Dispositivo } from "./analitica";
import { gzipABase64 } from "./comprimir";

/**
 * Grabación de sesiones del portal, solo en algunas: las que el servidor
 * elige al azar (10 % por defecto) y todas las de la persona que Aviva
 * marque por 1, 3 o 7 días (ver functions/src/uso/grabacion.ts).
 *
 * No es video: rrweb guarda la estructura de la pantalla y cada cambio, y
 * el panel la reconstruye. Este módulo se carga con `import()` desde
 * analitica.ts, y rrweb a su vez solo cuando de verdad se graba: quien no
 * se graba no descarga nada de esto.
 *
 * Privacidad:
 * - todo lo escrito en un campo sale como `****`;
 * - nombres de clientes, motivos de rechazo, montos y datos del vale
 *   (`.cell-cliente`, `dd`, `[data-privado]`…) salen tapados por completo;
 *   en el resto de los textos se tapan los números;
 * - la cámara (el escáner de códigos), los `<canvas>` y lo marcado
 *   `data-no-grabar` no se graban: se ve un recuadro vacío.
 *
 * Cómo se guarda: en pedazos de ~1 minuto, comprimidos. Cada pedazo
 * empieza con la pantalla completa, así que si uno se pierde el resto se
 * sigue viendo. Se suben solo con internet y nunca en modo de ahorro de
 * datos; mientras tanto esperan en el equipo.
 */

const MAX_BYTES = 900 * 1024;
/** Si un minuto junta más que esto sin comprimir, se corta antes. */
const MAX_TEXTO_FRAGMENTO = 3_000_000;
const MAX_PENDIENTES = 3_000_000;
const VIEJO_MS = 7 * 86_400_000;

/** Lo que se tapa por completo. Lo demás solo pierde sus números. */
const PRIVADO =
  "[data-privado], .cell-cliente, .cell-rejected, dd, .vale-resultado__alerta, .vale-resultado__detalle, .vale-resultado__monto";

export function enmascararTexto(texto: string, el: HTMLElement | null): string {
  if (el?.closest(PRIVADO)) return texto.replace(/\S/g, "*");
  return texto.replace(/\d/g, "*");
}

interface Pendiente {
  uid: string;
  sesionId: string;
  n: number;
  inicio: number;
  fin: number;
  ancho: number;
  alto: number;
  dispositivo: Dispositivo;
  pantallas: string[];
  datos: string;
  guardado: number;
}

function leerPendientes(): Pendiente[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PENDIENTES_GRABACION) ?? "[]") as Pendiente[];
  } catch {
    return [];
  }
}

function escribirPendientes(lista: Pendiente[]) {
  try {
    // Se queda con los más nuevos que quepan.
    const ahora = Date.now();
    const vigentes = lista.filter((p) => ahora - p.guardado < VIEJO_MS);
    let total = 0;
    const caben: Pendiente[] = [];
    for (const p of [...vigentes].reverse()) {
      total += p.datos.length;
      if (total > MAX_PENDIENTES) break;
      caben.unshift(p);
    }
    if (caben.length === 0) localStorage.removeItem(CLAVE_PENDIENTES_GRABACION);
    else localStorage.setItem(CLAVE_PENDIENTES_GRABACION, JSON.stringify(caben));
  } catch {
    // Sin espacio: ese pedazo se pierde; los demás se siguen viendo.
  }
}

function puedeSubir(): boolean {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return navigator.onLine && !conexion?.saveData;
}

let subiendo = false;

/** Sube, en orden, lo pendiente de quien tiene la sesión abierta. */
export async function subirPendientes(uid: string): Promise<void> {
  if (subiendo || !puedeSubir() || auth.currentUser?.uid !== uid) return;
  subiendo = true;
  try {
    for (const p of leerPendientes().filter((x) => x.uid === uid)) {
      const { uid: _u, guardado: _g, ...cuerpo } = p;
      const { data } = await subirGrabacionCallable({ ...cuerpo, ahora: Date.now() });
      escribirPendientes(leerPendientes().filter((x) => !(x.sesionId === p.sesionId && x.n === p.n)));
      if (!data.grabar) {
        // Ya no toca grabar esa sesión: lo demás de ella sobra.
        escribirPendientes(leerPendientes().filter((x) => x.sesionId !== p.sesionId));
      }
    }
  } catch {
    // Sin señal o error del servidor: se reintenta en el siguiente minuto.
  } finally {
    subiendo = false;
  }
}

function siguienteN(sesionId: string): number {
  const clave = `paydesk_grabacion_n_${sesionId}`;
  try {
    const n = Number(sessionStorage.getItem(clave) ?? "0") || 0;
    sessionStorage.setItem(clave, String(n + 1));
    return n;
  } catch {
    return Date.now() % 100_000;
  }
}

/**
 * Empieza a grabar esta pestaña. Devuelve con qué detenerla (al salir, o
 * si el servidor deja de pedir la grabación).
 */
export function iniciarGrabacion(opciones: {
  uid: string;
  sesionId: string;
  dispositivo: Dispositivo;
}): () => void {
  const { uid, sesionId, dispositivo } = opciones;
  let detenida = false;
  let pararRrweb: (() => void) | undefined;
  let buffer: string[] = [];
  let tamano = 0;
  let inicio = 0;
  let fin = 0;
  let ancho = window.innerWidth;
  let alto = window.innerHeight;
  let pantallas: string[] = [];
  let tomarFoto: (() => void) | null = null;

  function cerrarFragmento() {
    if (buffer.length === 0) return;
    const json = `[${buffer.join(",")}]`;
    const meta = { n: siguienteN(sesionId), inicio, fin, ancho, alto, pantallas };
    buffer = [];
    tamano = 0;
    pantallas = [];
    void (async () => {
      const { base64, bytes } = await gzipABase64(json);
      // Un minuto que ni comprimido cabe en un documento no se guarda.
      if (bytes > MAX_BYTES) return;
      escribirPendientes([
        ...leerPendientes(),
        { uid, sesionId, dispositivo, datos: base64, guardado: Date.now(), ...meta },
      ]);
      await subirPendientes(uid);
    })().catch(() => {});
  }

  function emitir(ev: { type: number; timestamp: number; data?: unknown }, esFoto?: boolean) {
    // Meta (4) con esFoto: rrweb empieza una foto completa → pedazo nuevo.
    if (esFoto && ev.type === 4) cerrarFragmento();
    const texto = JSON.stringify(ev);
    if (buffer.length === 0) {
      inicio = ev.timestamp;
      const d = ev.data as { width?: number; height?: number } | undefined;
      if (ev.type === 4 && d?.width && d?.height) {
        ancho = d.width;
        alto = d.height;
      }
    }
    buffer.push(texto);
    tamano += texto.length;
    fin = ev.timestamp;
    const p = pantallaActual();
    if (p && pantallas[pantallas.length - 1] !== p && !pantallas.includes(p)) pantallas.push(p);
    // Un minuto muy cargado se corta antes, con su propia foto completa.
    if (tamano > MAX_TEXTO_FRAGMENTO && tomarFoto) {
      const tomar = tomarFoto;
      setTimeout(() => !detenida && tomar(), 0);
    }
  }

  function alOcultar() {
    // Al ocultarse se cierra el pedazo (con foto nueva para el siguiente),
    // por si la pestaña ya no vuelve.
    if (document.visibilityState === "hidden") tomarFoto?.();
  }

  const intervalo = window.setInterval(() => void subirPendientes(uid), 60_000);
  const alVolver = () => void subirPendientes(uid);
  window.addEventListener("online", alVolver);
  document.addEventListener("visibilitychange", alOcultar);

  void import("rrweb")
    .then(({ record }) => {
      if (detenida) return;
      tomarFoto = () => record.takeFullSnapshot(true);
      pararRrweb = record({
        emit: emitir,
        checkoutEveryNms: 60_000,
        maskAllInputs: true,
        maskTextSelector: "*",
        maskTextFn: enmascararTexto,
        blockSelector: "video, canvas, .escaner, [data-no-grabar]",
        slimDOMOptions: "all",
        recordCanvas: false,
        collectFonts: false,
        inlineImages: false,
        sampling: { mousemove: 100, scroll: 150, media: 800, input: "last" },
      });
    })
    .catch(() => {});

  return () => {
    if (detenida) return;
    detenida = true;
    pararRrweb?.();
    cerrarFragmento();
    clearInterval(intervalo);
    window.removeEventListener("online", alVolver);
    document.removeEventListener("visibilitychange", alOcultar);
  };
}
