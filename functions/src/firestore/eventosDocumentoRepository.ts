import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

/**
 * Bitácora de lo que pasa con cada documento subido. Es la materia prima
 * de las métricas por tienda (/admin/metricas): cuántos documentos se
 * aceptan solos, cuántos caen en revisión, cuántos se rechazan y cuánto
 * tarda Aviva en atender una revisión. Sin esto, un rechazo automático no
 * dejaría rastro (el archivo nunca se guarda).
 */
const COLLECTION = "paydesk_eventos_documento";

export type ResultadoEvento =
  | "aceptado"
  | "en_revision"
  | "rechazado_auto"
  | "aprobado_admin"
  | "rechazado_admin";

export interface EventoDocumento {
  dealId: string;
  concesionarioId: string | null;
  tipo: "cotizacion" | "comprobante";
  resultado: ResultadoEvento;
  /** Para aprobado_admin / rechazado_admin: minutos desde que el documento entró a revisión. */
  minutosEnRevision?: number | null;
  en: Timestamp;
}

export async function registrarEventoDocumento(
  e: Omit<EventoDocumento, "en">,
): Promise<void> {
  await getFirestore()
    .collection(COLLECTION)
    .add({ ...e, en: FieldValue.serverTimestamp() });
}

export async function eventosDesde(desde: Date): Promise<EventoDocumento[]> {
  const snap = await getFirestore()
    .collection(COLLECTION)
    .where("en", ">=", Timestamp.fromDate(desde))
    .get();
  return snap.docs.map((d) => d.data() as EventoDocumento);
}
