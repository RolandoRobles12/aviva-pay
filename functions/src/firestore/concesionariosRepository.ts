import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

/** Every store in `ids`, skipping any that no longer exist. Order isn't guaranteed to match `ids`. */
export async function getConcesionariosByIds(
  ids: string[],
): Promise<PayDeskConcesionario[]> {
  const docs = await Promise.all(
    ids.map((id) => concesionariosCollection().doc(id).get()),
  );
  return docs
    .filter((d) => d.exists)
    .map((d) => d.data() as PayDeskConcesionario);
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
 * (possibly overridden by an admin) and `usuarios` are left untouched, so
 * a later HubSpot sync can't clobber them.
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
    usuarios: [],
    actualizadoEn: FieldValue.serverTimestamp(),
    creadoEn: FieldValue.serverTimestamp(),
  });

  return { isNew: true };
}

export async function updateConcesionarioFields(
  concesionarioId: string,
  fields: Partial<Pick<PayDeskConcesionario, "nombre" | "usuarios" | "rolloutDesde">>,
): Promise<void> {
  await concesionariosCollection()
    .doc(concesionarioId)
    .set(
      { ...fields, actualizadoEn: FieldValue.serverTimestamp() },
      { merge: true },
    );
}
