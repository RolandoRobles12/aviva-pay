import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { ResultadoOcr } from "../ocr/validarDocumento";

/**
 * El resultado completo de verificar un documento: lo que leyó Claude, los
 * motivos (incluidos los que delatan sospecha de fraude) y el error
 * técnico si lo hubo.
 *
 * Vive fuera del deal a propósito. La tienda lee su deal directo de
 * Firestore (listener en tiempo real), así que todo lo que está en el
 * deal lo puede ver cualquiera con su sesión y las herramientas del
 * navegador. Esta colección no tiene ninguna regla de lectura: solo la
 * tocan las funciones, y solo los administradores la reciben.
 */
const COLLECTION = "paydesk_verificaciones";

export type TipoDocumento = "cotizacion" | "comprobante";

export interface VerificacionGuardada {
  dealId: string;
  tipo: TipoDocumento;
  concesionarioId: string | null;
  verificacion: ResultadoOcr;
  /** Cuándo se avisó que la revisión de este documento va atrasada (una sola vez por subida). */
  recordatorioEn?: string | null;
}

function docId(dealId: string, tipo: TipoDocumento) {
  return `${dealId}_${tipo}`;
}

function coleccion() {
  return getFirestore().collection(COLLECTION);
}

export async function guardarVerificacion(v: VerificacionGuardada): Promise<void> {
  await coleccion()
    .doc(docId(v.dealId, v.tipo))
    .set({ ...v, recordatorioEn: null, actualizadoEn: FieldValue.serverTimestamp() });
}

export async function getVerificacion(
  dealId: string,
  tipo: TipoDocumento,
): Promise<VerificacionGuardada | null> {
  const snap = await coleccion().doc(docId(dealId, tipo)).get();
  return snap.exists ? (snap.data() as VerificacionGuardada) : null;
}

/** Las verificaciones de varios deals, para la vista de tienda del admin. Llave: `${dealId}_${tipo}`. */
export async function getVerificacionesDeDeals(
  dealIds: string[],
): Promise<Map<string, VerificacionGuardada>> {
  const refs = dealIds.flatMap((id) =>
    (["cotizacion", "comprobante"] as const).map((t) => coleccion().doc(docId(id, t))),
  );
  const mapa = new Map<string, VerificacionGuardada>();
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await getFirestore().getAll(...refs.slice(i, i + 300));
    for (const s of snaps) if (s.exists) mapa.set(s.id, s.data() as VerificacionGuardada);
  }
  return mapa;
}

export async function marcarRecordatorio(dealId: string, tipo: TipoDocumento): Promise<void> {
  await coleccion()
    .doc(docId(dealId, tipo))
    .set({ recordatorioEn: new Date().toISOString() }, { merge: true });
}
