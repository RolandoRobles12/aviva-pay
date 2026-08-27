import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { formatKioscoDisplay } from "../concesionario/identity";
import { ensureConcesionario } from "./concesionariosRepository";
import type { PayDeskDeal } from "../types/deal";

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
  data: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">,
): Promise<{ isNewConcesionario: boolean }> {
  const dealRef = dealsCollection().doc(data.dealId);
  const existingDeal = await dealRef.get();
  const existing = existingDeal.exists ? (existingDeal.data() as PayDeskDeal) : null;

  const { cotizacionUrl, comprobanteUrl, ...syncedFromHubspot } = data;

  await dealRef.set(
    {
      ...syncedFromHubspot,
      cotizacionUrl: existing?.cotizacionUrl ?? cotizacionUrl,
      comprobanteUrl: existing?.comprobanteUrl ?? comprobanteUrl,
      actualizadoEn: FieldValue.serverTimestamp(),
      ...(existing ? {} : { creadoEn: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

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
