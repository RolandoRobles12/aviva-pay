import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const COLLECTION = "paydesk_concesionario_users";

/**
 * Reverse index: uid → every store that uid can sign in to. A store's own
 * document (`paydesk_concesionarios/{id}.usuarios`) is the forward
 * direction an admin edits; this is what the custom claim
 * (`concesionarioIds`) gets computed from, and what makes "which stores
 * can this email see" a single lookup instead of a scan across every
 * store — see concesionario/userSync.ts, which keeps both sides in sync.
 */
export interface ConcesionarioUserRecord {
  uid: string;
  email: string;
  concesionarioIds: string[];
  invitadoEn: Timestamp;
  ultimoAccesoEn: Timestamp | null;
}

function usersCollection() {
  return getFirestore().collection(COLLECTION);
}

export async function getConcesionarioUser(
  uid: string,
): Promise<ConcesionarioUserRecord | null> {
  const snap = await usersCollection().doc(uid).get();
  return snap.exists ? (snap.data() as ConcesionarioUserRecord) : null;
}

/** Upserts the full set of stores this uid can see. Empty array is valid — it means "account exists, sees nothing yet." */
export async function setConcesionarioUserStores(
  uid: string,
  email: string,
  concesionarioIds: string[],
): Promise<void> {
  const existing = await usersCollection().doc(uid).get();
  await usersCollection()
    .doc(uid)
    .set(
      {
        uid,
        email,
        concesionarioIds,
        ...(existing.exists ? {} : { invitadoEn: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
}
