import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { formatKioscoDisplay } from "../concesionario/identity";
import type { PayDeskDeal, PayDeskConcesionario } from "../types/deal";

const DEALS_COLLECTION = "paydesk_deals";
const CONCESIONARIOS_COLLECTION = "paydesk_concesionarios";

export function dealsCollection() {
  return getFirestore().collection(DEALS_COLLECTION);
}

export function concesionariosCollection() {
  return getFirestore().collection(CONCESIONARIOS_COLLECTION);
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

export async function getConcesionario(
  concesionarioId: string,
): Promise<PayDeskConcesionario | null> {
  const snap = await concesionariosCollection().doc(concesionarioId).get();
  return snap.exists ? (snap.data() as PayDeskConcesionario) : null;
}

/**
 * Upserts a deal document from freshly-fetched HubSpot data, and makes sure
 * its concesionario document exists too. Returns `isNewConcesionario: true`
 * only the first time we ever see this concesionarioId — that's the signal
 * used to trigger the "send the page URL" notification (section 9), since
 * a concesionario should only be notified once, not on every new deal.
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

  let isNewConcesionario = false;
  if (data.concesionarioId && data.kiosco) {
    const concesionarioRef = concesionariosCollection().doc(
      data.concesionarioId,
    );
    const existingConcesionario = await concesionarioRef.get();
    isNewConcesionario = !existingConcesionario.exists;

    const { nombre, numero } = formatKioscoDisplay(data.kiosco);

    await concesionarioRef.set(
      {
        concesionarioId: data.concesionarioId,
        kiosco: data.kiosco,
        nombre,
        numero,
        actualizadoEn: FieldValue.serverTimestamp(),
        ...(isNewConcesionario
          ? { creadoEn: FieldValue.serverTimestamp() }
          : {}),
      },
      { merge: true },
    );
  }

  return { isNewConcesionario };
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

export type { PayDeskConcesionario };
