import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { conBitacora } from "./bitacoraConfig";
import { TTL_CONFIG_MS } from "./configCache";
import { USO_CONFIG_DEFAULT, type UsoConfig } from "../uso/grabacion";
import type { Dispositivo, Evento, Perfil } from "../uso/eventos";

/**
 * Dónde vive la medición de uso del portal, todo en Firestore:
 * - `paydesk_interacciones`: un documento por lote de eventos (lo que una
 *   pestaña junta en ~1 minuto), con quién lo mandó. Un documento por
 *   lote y no por evento: un toque no merece una escritura propia.
 * - `paydesk_grabaciones/{sesionId}`: los datos de cada sesión grabada, y
 *   sus pedazos de ~1 minuto en la subcolección `fragmentos`.
 * - `paydesk_config/uso`: el % de grabación, a quién grabar y hasta
 *   cuándo, y cuántos días se guarda todo.
 *
 * Por qué Firestore y no Storage para las grabaciones: cada pedazo
 * comprimido pesa decenas de KB, cabe de sobra en un documento, y así se
 * leen y se borran con los mismos permisos que todo lo demás (las reglas
 * de Storage de Paydesk no dan lectura a nadie, ni a las funciones por la
 * ruta del cliente).
 *
 * Nada de esto se lee ni se escribe desde el navegador (ver
 * firestore.rules): entra por registrarInteracciones / subirGrabacion y
 * sale por las funciones del panel.
 */
export const COL_INTERACCIONES = "paydesk_interacciones";
export const COL_GRABACIONES = "paydesk_grabaciones";
const COL_CONFIG = "paydesk_config";
const DOC_CONFIG = "uso";

const DIA_MS = 86_400_000;

export interface LoteDoc {
  /** Versión del esquema del portal que lo mandó. */
  version: number;
  /** Eventos que llegaron y no se reconocieron (de otra versión del portal, o dañados). */
  descartados: number;
  uid: string;
  email: string | null;
  perfil: Perfil;
  tiendas: string[];
  sesionId: string;
  dispositivo: Dispositivo;
  /** El primer evento del lote. */
  desde: Timestamp;
  recibido: Timestamp;
  eventos: Evento[];
  expira: Timestamp;
}

export interface GrabacionDoc {
  uid: string;
  email: string | null;
  perfil: Perfil;
  tiendas: string[];
  dispositivo: Dispositivo;
  inicio: Timestamp;
  fin: Timestamp;
  fragmentos: number;
  bytes: number;
  pantallas: string[];
  /** Si se grabó porque Aviva eligió a la persona, no por azar. */
  elegida: boolean;
  expira: Timestamp;
}

export interface FragmentoDoc {
  n: number;
  inicio: number;
  fin: number;
  /** Eventos de rrweb en JSON, comprimidos con gzip. */
  datos: Buffer;
  bytes: number;
  /** Pantallas vistas en este minuto; la primera es la de su foto completa. */
  pantallas: string[];
  ancho: number;
  alto: number;
}

// --- Configuración ---

let cached: UsoConfig | null = null;
let cacheExpira = 0;

function configDoc() {
  return getFirestore().collection(COL_CONFIG).doc(DOC_CONFIG);
}

function normalizar(data: Record<string, unknown> | undefined): UsoConfig {
  const d = data ?? {};
  const pct = Number(d.porcentajeGrabacion);
  const diasI = Number(d.diasInteracciones);
  const diasG = Number(d.diasGrabaciones);
  const grabarHasta: Record<string, number> = {};
  const crudo = (d.grabarHasta ?? {}) as Record<string, unknown>;
  for (const [email, v] of Object.entries(crudo)) {
    const ms = v instanceof Timestamp ? v.toMillis() : Number(v);
    if (Number.isFinite(ms)) grabarHasta[email] = ms;
  }
  return {
    porcentajeGrabacion: Number.isFinite(pct)
      ? Math.min(100, Math.max(0, Math.round(pct)))
      : USO_CONFIG_DEFAULT.porcentajeGrabacion,
    grabarHasta,
    diasInteracciones: diasI >= 7 ? Math.round(diasI) : USO_CONFIG_DEFAULT.diasInteracciones,
    diasGrabaciones: diasG >= 1 ? Math.round(diasG) : USO_CONFIG_DEFAULT.diasGrabaciones,
  };
}

/** Con caché de un minuto: la leen todos los lotes de todas las tiendas. */
export async function getUsoConfig(): Promise<UsoConfig> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getUsoConfigFresh();
}

export async function getUsoConfigFresh(): Promise<UsoConfig> {
  const snap = await configDoc().get();
  cached = normalizar(snap.data());
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return cached;
}

export async function setUsoConfig(
  cambio: Partial<UsoConfig>,
  actualizadoPor: string,
): Promise<UsoConfig> {
  const actual = await getUsoConfigFresh();
  const siguiente = normalizar({ ...actual, ...cambio });
  // Las elecciones vencidas no se arrastran para siempre.
  const ahora = Date.now();
  siguiente.grabarHasta = Object.fromEntries(
    Object.entries(siguiente.grabarHasta).filter(([, hasta]) => hasta > ahora),
  );
  await conBitacora(configDoc(), actualizadoPor, (ref) =>
    // set sin merge: `grabarHasta` es un mapa y con merge no se podría quitar a nadie.
    ref.set({ ...siguiente, actualizadoPor, actualizadoEn: FieldValue.serverTimestamp() }),
  );
  cached = null;
  return siguiente;
}

// --- Escritura desde el portal ---

/**
 * Guarda un lote. Con `loteId` el documento se llama `{uid}_{loteId}` y se
 * crea solo si no existe: un reintento del mismo lote (se cortó la señal
 * antes de la respuesta) no lo guarda dos veces. Devuelve si era repetido.
 */
export async function guardarLote(
  lote: Omit<LoteDoc, "recibido" | "expira">,
  diasRetencion: number,
  loteId?: string,
): Promise<{ repetido: boolean }> {
  const ahora = Date.now();
  const col = getFirestore().collection(COL_INTERACCIONES);
  const ref = loteId ? col.doc(`${lote.uid}_${loteId}`) : col.doc();
  try {
    await ref.create({
      // Sin `undefined` (Firestore no los acepta) en los campos opcionales de los eventos.
      ...(JSON.parse(JSON.stringify(lote)) as typeof lote),
      desde: lote.desde,
      recibido: Timestamp.fromMillis(ahora),
      expira: Timestamp.fromMillis(ahora + diasRetencion * DIA_MS),
    });
  } catch (err) {
    // 6 = ALREADY_EXISTS: ya se había guardado.
    if ((err as { code?: number }).code === 6) return { repetido: true };
    throw err;
  }
  return { repetido: false };
}

export class GrabacionAjenaError extends Error {}

/**
 * Guarda un pedazo y actualiza los datos de la sesión. La sesión queda
 * ligada al uid de su primer pedazo: nadie más puede agregarle pedazos.
 */
export async function guardarFragmento(params: {
  sesionId: string;
  uid: string;
  email: string | null;
  perfil: Perfil;
  tiendas: string[];
  dispositivo: Dispositivo;
  elegida: boolean;
  fragmento: FragmentoDoc;
  diasRetencion: number;
}): Promise<void> {
  const db = getFirestore();
  const ref = db.collection(COL_GRABACIONES).doc(params.sesionId);
  const fragRef = ref.collection("fragmentos").doc(String(params.fragmento.n).padStart(5, "0"));
  const f = params.fragmento;

  await db.runTransaction(async (t) => {
    const [snap, fragSnap] = await Promise.all([t.get(ref), t.get(fragRef)]);
    const actual = snap.exists ? (snap.data() as GrabacionDoc) : null;
    if (actual && actual.uid !== params.uid) throw new GrabacionAjenaError();
    // Un reintento del mismo pedazo (se cortó la señal antes de la respuesta) no suma dos veces.
    const previo = fragSnap.exists ? (fragSnap.data() as FragmentoDoc) : null;

    const inicio = Math.min(actual?.inicio.toMillis() ?? f.inicio, f.inicio);
    const fin = Math.max(actual?.fin.toMillis() ?? f.fin, f.fin);
    t.set(fragRef, f);
    t.set(
      ref,
      {
        uid: params.uid,
        email: params.email,
        perfil: params.perfil,
        tiendas: params.tiendas,
        dispositivo: params.dispositivo,
        elegida: Boolean(actual?.elegida || params.elegida),
        inicio: Timestamp.fromMillis(inicio),
        fin: Timestamp.fromMillis(fin),
        fragmentos: FieldValue.increment(previo ? 0 : 1),
        bytes: FieldValue.increment(f.bytes - (previo?.bytes ?? 0)),
        ...(f.pantallas.length > 0 ? { pantallas: FieldValue.arrayUnion(...f.pantallas) } : {}),
        expira: Timestamp.fromMillis(fin + params.diasRetencion * DIA_MS),
      },
      { merge: true },
    );
  });
}

// --- Lectura para el panel ---

export async function lotesDesde(desde: Date): Promise<LoteDoc[]> {
  const snap = await getFirestore()
    .collection(COL_INTERACCIONES)
    .where("desde", ">=", Timestamp.fromDate(desde))
    .get();
  return snap.docs.map((d) => d.data() as LoteDoc);
}

export async function lotesDeSesion(sesionId: string): Promise<LoteDoc[]> {
  const snap = await getFirestore()
    .collection(COL_INTERACCIONES)
    .where("sesionId", "==", sesionId)
    .get();
  return snap.docs.map((d) => d.data() as LoteDoc);
}

export async function listarGrabaciones(desde: Date, limite: number) {
  const snap = await getFirestore()
    .collection(COL_GRABACIONES)
    .where("inicio", ">=", Timestamp.fromDate(desde))
    .orderBy("inicio", "desc")
    .limit(limite)
    .get();
  return snap.docs.map((d) => ({ sesionId: d.id, ...(d.data() as GrabacionDoc) }));
}

export async function getGrabacion(sesionId: string) {
  const ref = getFirestore().collection(COL_GRABACIONES).doc(sesionId);
  const [snap, frags] = await Promise.all([
    ref.get(),
    ref.collection("fragmentos").select("n", "inicio", "fin", "bytes", "pantallas", "ancho", "alto").get(),
  ]);
  if (!snap.exists) return null;
  return {
    grabacion: snap.data() as GrabacionDoc,
    fragmentos: frags.docs
      .map((d) => d.data() as Omit<FragmentoDoc, "datos">)
      .sort((a, b) => a.n - b.n),
  };
}

export async function getFragmentos(sesionId: string, ns: number[]): Promise<FragmentoDoc[]> {
  const col = getFirestore().collection(COL_GRABACIONES).doc(sesionId).collection("fragmentos");
  const snaps = await getFirestore().getAll(...ns.map((n) => col.doc(String(n).padStart(5, "0"))));
  return snaps.filter((s) => s.exists).map((s) => s.data() as FragmentoDoc);
}

/**
 * Un pedazo cuya foto completa muestra `pantalla` en ese tipo de equipo:
 * el fondo del mapa de toques. El más reciente, para que se parezca a la
 * pantalla de hoy.
 */
export async function fragmentoDePantalla(
  pantalla: string,
  dispositivo: Dispositivo,
  desde: Date,
): Promise<{ sesionId: string; n: number } | null> {
  const sesiones = await getFirestore()
    .collection(COL_GRABACIONES)
    .where("pantallas", "array-contains", pantalla)
    .limit(40)
    .get();
  const candidatas = sesiones.docs
    .map((d) => ({ id: d.id, g: d.data() as GrabacionDoc }))
    .filter(({ g }) => g.dispositivo === dispositivo && g.fin.toMillis() >= desde.getTime())
    .sort((a, b) => b.g.fin.toMillis() - a.g.fin.toMillis());
  for (const { id } of candidatas.slice(0, 8)) {
    const frags = await getFirestore()
      .collection(COL_GRABACIONES)
      .doc(id)
      .collection("fragmentos")
      .select("n", "pantallas")
      .get();
    const f = frags.docs
      .map((d) => d.data() as Pick<FragmentoDoc, "n" | "pantallas">)
      .filter((x) => x.pantallas[0] === pantalla)
      .sort((a, b) => b.n - a.n)[0];
    if (f) return { sesionId: id, n: f.n };
  }
  return null;
}

export async function borrarGrabacion(sesionId: string): Promise<void> {
  const db = getFirestore();
  await db.recursiveDelete(db.collection(COL_GRABACIONES).doc(sesionId));
}

// --- Limpieza ---

/** Borra lo que ya pasó del plazo. Devuelve cuántos documentos se fueron. */
export async function limpiarVencidos(config: Pick<UsoConfig, "diasInteracciones" | "diasGrabaciones">) {
  const db = getFirestore();
  const ahora = Date.now();
  let interacciones = 0;
  let grabaciones = 0;

  const limiteI = Timestamp.fromMillis(ahora - config.diasInteracciones * DIA_MS);
  for (;;) {
    const snap = await db.collection(COL_INTERACCIONES).where("desde", "<", limiteI).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    interacciones += snap.size;
  }

  const limiteG = Timestamp.fromMillis(ahora - config.diasGrabaciones * DIA_MS);
  for (;;) {
    const snap = await db.collection(COL_GRABACIONES).where("fin", "<", limiteG).limit(50).get();
    if (snap.empty) break;
    for (const d of snap.docs) await db.recursiveDelete(d.ref);
    grabaciones += snap.size;
  }
  return { interacciones, grabaciones };
}

/**
 * Quién usó el portal desde una fecha (uid, perfil y cuándo), sin los
 * eventos: para contar personas activas en Métricas sin traer cada lote
 * completo.
 */
export async function actividadDesde(
  desde: Date,
): Promise<Array<{ uid: string; perfil: Perfil; en: string }>> {
  const snap = await getFirestore()
    .collection(COL_INTERACCIONES)
    .where("desde", ">=", Timestamp.fromDate(desde))
    .select("uid", "perfil", "desde")
    .get();
  return snap.docs.map((d) => {
    const l = d.data() as Pick<LoteDoc, "uid" | "perfil" | "desde">;
    return { uid: l.uid, perfil: l.perfil, en: l.desde.toDate().toISOString() };
  });
}
