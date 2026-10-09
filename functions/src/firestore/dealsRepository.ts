import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { formatKioscoDisplay } from "../concesionario/identity";
import { ensureConcesionario } from "./concesionariosRepository";
import { getCancelStages } from "./cancelStagesRepository";
import type { DealSincronizado, PayDeskDeal } from "../types/deal";

const COLLECTION = "paydesk_deals";

export function dealsCollection() {
  return getFirestore().collection(COLLECTION);
}

export async function getDeal(dealId: string): Promise<PayDeskDeal | null> {
  const snap = await dealsCollection().doc(dealId).get();
  return snap.exists ? (snap.data() as PayDeskDeal) : null;
}

/** All deals belonging to one concesionario, for the status table (section 5.1). */
export async function getDealsByConcesionario(
  concesionarioId: string,
): Promise<PayDeskDeal[]> {
  const snap = await dealsCollection()
    .where("concesionarioId", "==", concesionarioId)
    .get();
  return snap.docs.map((doc) => doc.data() as PayDeskDeal);
}

/**
 * All deals across every store in `ids` — for a user with access to more
 * than one store, whose list combines all of them. Firestore's `in`
 * operator caps at 30 values, so this chunks and merges; a user with more
 * than 30 stores is not a case Paydesk has today, but this doesn't fall
 * over if it happens.
 */
export async function getDealsByConcesionarioIds(
  ids: string[],
): Promise<PayDeskDeal[]> {
  const CHUNK = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    chunks.push(ids.slice(i, i + CHUNK));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      dealsCollection().where("concesionarioId", "in", chunk).get(),
    ),
  );

  return results.flatMap((snap) => snap.docs.map((doc) => doc.data() as PayDeskDeal));
}

/**
 * Upserts a deal document from freshly-fetched HubSpot data, creating the
 * store's document if this is the first deal we've seen for that Kiosco.
 * Returns `isNewConcesionario: true` only on that first sight — the signal
 * used to trigger the "notify the store" workflow (section 9), since a
 * store should only be notified once, not on every new deal.
 *
 * cotizacionUrl/comprobanteUrl are deliberately excluded from the regular
 * merge: `data` carries whatever the HubSpot deal property holds right
 * now, which — once a concesionario or admin has uploaded through Paydesk
 * — is the HubSpot Files copy's URL (see hubspot/uploads.ts), not the
 * Cloud Storage one Firestore is supposed to serve. Letting an ordinary
 * sync overwrite it would silently undo every upload's "Ver archivo" link
 * the next time this deal's HubSpot workflow fires for any reason. Once
 * Firestore already has a value for either field, it wins; HubSpot's is
 * only used as a first-time fallback, e.g. a historical deal whose file
 * was never uploaded through Paydesk at all.
 */
export async function upsertDealFromHubspot(
  data: DealSincronizado,
): Promise<{ isNewConcesionario: boolean }> {
  const dealRef = dealsCollection().doc(data.dealId);
  const existingDeal = await dealRef.get();
  const existing = existingDeal.exists ? (existingDeal.data() as PayDeskDeal) : null;

  const { cotizacionUrl, comprobanteUrl, etapasExtra, ...syncedFromHubspot } = data;

  // Se resuelve aquí, en el único punto por donde pasan tanto el webhook
  // como el backfill, para que las dos rutas coincidan siempre.
  const etapasCanceladas = await getCancelStages();
  const cancelado = Boolean(
    data.dealstage && etapasCanceladas.includes(data.dealstage),
  );

  await dealRef.set(
    {
      ...syncedFromHubspot,
      cancelado,
      // Un deal con archivo en Storage (`*Path`) ya no guarda URL: "Ver
      // archivo" pide una liga temporal. Sin esta condición, el `?? ` de
      // abajo volvería a escribir la URL de HubSpot en cada sincronización.
      cotizacionUrl: existing?.cotizacionPath ? null : (existing?.cotizacionUrl ?? cotizacionUrl),
      comprobanteUrl: existing?.comprobantePath ? null : (existing?.comprobanteUrl ?? comprobanteUrl),
      actualizadoEn: FieldValue.serverTimestamp(),
      ...(existing ? {} : { creadoEn: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  // Las fechas de etapas personalizadas se reemplazan completas: con
  // `merge` se mezclarían y las de etapas que el admin ya quitó se
  // quedarían para siempre. `update` reemplaza el mapa entero.
  if (etapasExtra !== undefined) {
    await dealRef.update({ etapasExtra });
  }

  if (!data.concesionarioId || !data.kiosco) {
    return { isNewConcesionario: false };
  }

  const { nombre, numero } = formatKioscoDisplay(data.kiosco);
  const { isNew } = await ensureConcesionario({
    concesionarioId: data.concesionarioId,
    kiosco: data.kiosco,
    nombreSugerido: nombre,
    numero,
  });

  return { isNewConcesionario: isNew };
}

export async function patchDealFields(
  dealId: string,
  fields: Partial<PayDeskDeal>,
): Promise<void> {
  await dealsCollection()
    .doc(dealId)
    .set(
      { ...fields, actualizadoEn: FieldValue.serverTimestamp() },
      { merge: true },
    );
}

type TipoDocumento = "cotizacion" | "comprobante";

/**
 * Una aprobación que lleva más que esto en "aprobando" se da por muerta
 * (la función se cayó a medio camino) y la revisión vuelve a estar
 * disponible. Holgado respecto al timeout de adminResolverRevision (120 s).
 */
export const APROBACION_ABANDONADA_MS = 10 * 60_000;

/** ¿La revisión espera a un administrador? Incluye aprobaciones abandonadas. */
export function revisionDisponible(
  revision: PayDeskDeal["cotizacionRevision"],
  ahora = Date.now(),
): boolean {
  if (revision?.estado === "pendiente") return true;
  return (
    revision?.estado === "aprobando" &&
    (!revision.resueltoEn || ahora - Date.parse(revision.resueltoEn) > APROBACION_ABANDONADA_MS)
  );
}

/** Las revisiones que esperan a un administrador, de un tipo de documento, de todas las tiendas. */
export async function getDealsConRevisionPendiente(tipo: TipoDocumento): Promise<PayDeskDeal[]> {
  const snap = await dealsCollection()
    .where(`${tipo}Revision.estado`, "in", ["pendiente", "aprobando"])
    .get();
  const campo = `${tipo}Revision` as const;
  return snap.docs
    .map((d) => d.data() as PayDeskDeal)
    .filter((d) => revisionDisponible(d[campo]));
}

/**
 * Quita la revisión del deal, pero solo si sigue siendo la de `storagePath`.
 * Si mientras tanto la tienda subió otro documento (otra revisión), esa se
 * respeta: borrarla perdería el documento nuevo.
 */
export async function limpiarRevisionSi(
  dealId: string,
  tipo: TipoDocumento,
  storagePath: string,
): Promise<void> {
  const ref = dealsCollection().doc(dealId);
  const campo = `${tipo}Revision` as const;
  await getFirestore().runTransaction(async (t) => {
    const deal = (await t.get(ref)).data() as PayDeskDeal | undefined;
    if (deal?.[campo]?.storagePath === storagePath) t.update(ref, { [campo]: null });
  });
}

/**
 * Toma una revisión pendiente para resolverla, de forma atómica: si dos
 * administradores la resuelven a la vez, solo uno la obtiene. Devuelve la
 * revisión tomada, o null si ya no estaba pendiente.
 */
export async function tomarRevision(
  dealId: string,
  tipo: TipoDocumento,
  nuevoEstado: Partial<NonNullable<PayDeskDeal["cotizacionRevision"]>>,
): Promise<NonNullable<PayDeskDeal["cotizacionRevision"]> | null> {
  const ref = dealsCollection().doc(dealId);
  const campo = `${tipo}Revision` as const;
  return getFirestore().runTransaction(async (t) => {
    const revision = ((await t.get(ref)).data() as PayDeskDeal | undefined)?.[campo];
    if (!revision || !revisionDisponible(revision)) return null;
    t.update(ref, { [campo]: { ...revision, ...nuevoEstado } });
    return revision;
  });
}

/** Regresa a "pendiente" una revisión que se estaba aprobando y falló a medio camino. */
export async function devolverRevision(
  dealId: string,
  tipo: TipoDocumento,
  storagePath: string,
): Promise<void> {
  const ref = dealsCollection().doc(dealId);
  const campo = `${tipo}Revision` as const;
  await getFirestore().runTransaction(async (t) => {
    const revision = ((await t.get(ref)).data() as PayDeskDeal | undefined)?.[campo];
    if (revision?.estado === "aprobando" && revision.storagePath === storagePath) {
      t.update(ref, { [campo]: { ...revision, estado: "pendiente" } });
    }
  });
}

/**
 * Borra del deal el resultado de verificación que una versión anterior
 * guardaba ahí (`cotizacionOcr` / `comprobanteOcr`). Ahora vive en
 * paydesk_verificaciones, fuera del alcance de la tienda.
 */
export function camposOcrViejos(tipo: TipoDocumento): Record<string, FieldValue> {
  return { [`${tipo}Ocr`]: FieldValue.delete() };
}
