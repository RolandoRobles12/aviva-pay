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
 * Upserts a deal document from freshly-fetched HubSpot data, creating the
 * store's document if this is the first deal we've seen for that Kiosco.
 * Returns `isNewConcesionario: true` only on that first sight — the signal
 * used to trigger the "notify the store" workflow (section 9), since a
 * store should only be notified once, not on every new deal.
 */
export async function upsertDealFromHubspot(
  data: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">,
): Promise<{ isNewConcesionario: boolean }> {
  const dealRef = dealsCollection().doc(data.dealId);
  const existingDeal = await dealRef.get();

  await dealRef.set(
    {
      ...data,
      actualizadoEn: FieldValue.serverTimestamp(),
      ...(existingDeal.exists ? {} : { creadoEn: FieldValue.serverTimestamp() }),
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
