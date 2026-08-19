import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { PayDeskDeal } from "../types/deal";

const COLLECTION = "paydesk_deals";

export function dealsCollection() {
  return getFirestore().collection(COLLECTION);
}

export async function getDeal(dealId: string): Promise<PayDeskDeal | null> {
  const snap = await dealsCollection().doc(dealId).get();
  return snap.exists ? (snap.data() as PayDeskDeal) : null;
}

/**
 * Upserts a deal document from freshly-fetched HubSpot data. Returns
 * `true` when this is the document's first write (used by the sync webhook
 * to decide whether to trigger the "send the URL to the concesionario"
 * notification described in section 9).
 */
export async function upsertDealFromHubspot(
  data: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">,
): Promise<{ isNew: boolean }> {
  const ref = dealsCollection().doc(data.dealId);
  const existing = await ref.get();
  const isNew = !existing.exists;

  await ref.set(
    {
      ...data,
      actualizadoEn: FieldValue.serverTimestamp(),
      ...(isNew ? { creadoEn: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );

  return { isNew };
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

export type { Timestamp };
