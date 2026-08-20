import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { PayDeskConcesionario } from "../types/deal";

const COLLECTION = "paydesk_concesionarios";

export function concesionariosCollection() {
  return getFirestore().collection(COLLECTION);
}

export async function getConcesionario(
  concesionarioId: string,
): Promise<PayDeskConcesionario | null> {
  const snap = await concesionariosCollection().doc(concesionarioId).get();
  return snap.exists ? (snap.data() as PayDeskConcesionario) : null;
}

/** Looks a store up by the código it logs in with. Returns null if no store claims that código. */
export async function findConcesionarioByCodigo(
  codigo: string,
): Promise<PayDeskConcesionario | null> {
  const snap = await concesionariosCollection()
    .where("codigo", "==", codigo)
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as PayDeskConcesionario);
}

export async function listConcesionarios(): Promise<PayDeskConcesionario[]> {
  const snap = await concesionariosCollection().orderBy("numero").get();
  return snap.docs.map((doc) => doc.data() as PayDeskConcesionario);
}

/**
 * Creates the store document the first time a deal for this Kiosco syncs.
 * Returns whether it was newly created, which is the signal to fire the
 * "notify the store" workflow (requirement section 9) exactly once.
 *
 * Only ever writes the identity fields: an existing store's `nombre`
 * (possibly overridden by an admin), `codigo` and credentials are left
 * untouched, so a later HubSpot sync can't clobber them.
 */
export async function ensureConcesionario(params: {
  concesionarioId: string;
  kiosco: string;
  nombreSugerido: string;
  numero: string | null;
}): Promise<{ isNew: boolean }> {
  const ref = concesionariosCollection().doc(params.concesionarioId);
  const existing = await ref.get();

  if (existing.exists) {
    await ref.set(
      { kiosco: params.kiosco, actualizadoEn: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { isNew: false };
  }

  await ref.set({
    concesionarioId: params.concesionarioId,
    kiosco: params.kiosco,
    nombre: params.nombreSugerido,
    numero: params.numero,
    // Default the login código to the store number — it's short, unique
    // and something the store already knows. Admin can change it.
    codigo: params.numero ?? params.concesionarioId,
    nipHash: null,
    nipActualizadoEn: null,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    ultimoAccesoEn: null,
    actualizadoEn: FieldValue.serverTimestamp(),
    creadoEn: FieldValue.serverTimestamp(),
  });

  return { isNew: true };
}

export async function recordFailedLogin(
  concesionarioId: string,
  bloqueadoHasta: Timestamp | null,
): Promise<void> {
  await concesionariosCollection()
    .doc(concesionarioId)
    .set(
      {
        intentosFallidos: FieldValue.increment(1),
        ...(bloqueadoHasta ? { bloqueadoHasta } : {}),
      },
      { merge: true },
    );
}

export async function recordSuccessfulLogin(
  concesionarioId: string,
): Promise<void> {
  await concesionariosCollection()
    .doc(concesionarioId)
    .set(
      {
        intentosFallidos: 0,
        bloqueadoHasta: null,
        ultimoAccesoEn: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/** Clears a store's lockout and failed-attempt counter. */
export async function clearLockout(concesionarioId: string): Promise<void> {
  await concesionariosCollection()
    .doc(concesionarioId)
    .set({ intentosFallidos: 0, bloqueadoHasta: null }, { merge: true });
}

export async function updateConcesionarioFields(
  concesionarioId: string,
  fields: Partial<
    Pick<PayDeskConcesionario, "nombre" | "codigo" | "nipHash" | "rolloutDesde">
  > & { nipActualizadoEn?: FieldValue },
): Promise<void> {
  await concesionariosCollection()
    .doc(concesionarioId)
    .set(
      { ...fields, actualizadoEn: FieldValue.serverTimestamp() },
      { merge: true },
    );
}
