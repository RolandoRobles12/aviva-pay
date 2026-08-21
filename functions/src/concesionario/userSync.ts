import { getAuth } from "firebase-admin/auth";
import {
  getConcesionarioUser,
  setConcesionarioUserStores,
} from "../firestore/concesionarioUsersRepository";

/**
 * Reconciles one store's invited-emails list with Firebase Auth, the
 * reverse index, and each affected user's custom claim.
 *
 * For every newly-added email: creates a bare Firebase Auth account if
 * none exists yet (no usable password — the caller is expected to trigger
 * Firebase's own password-reset email right after this returns, which is
 * how that bare account gets turned into one the person can actually sign
 * in with; see lib/firebase.ts on the frontend, `sendPasswordResetEmail`).
 * For every removed email: leaves the Auth account alone (other stores
 * may still need it) and just drops this store from their claim.
 *
 * A user's `concesionarioIds` claim is always recomputed from the
 * reverse-index doc after either kind of change, since the same email can
 * be invited to more than one store.
 */
export async function syncConcesionarioUsuarios(
  concesionarioId: string,
  previousEmails: string[],
  nextEmails: string[],
): Promise<{ invitados: string[] }> {
  const before = new Set(previousEmails);
  const after = new Set(nextEmails);
  const added = nextEmails.filter((e) => !before.has(e));
  const removed = previousEmails.filter((e) => !after.has(e));

  const auth = getAuth();

  for (const email of added) {
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      user = await auth.createUser({ email, emailVerified: false });
    }
    const record = await getConcesionarioUser(user.uid);
    const ids = new Set(record?.concesionarioIds ?? []);
    ids.add(concesionarioId);
    const concesionarioIds = [...ids];
    await setConcesionarioUserStores(user.uid, email, concesionarioIds);
    await auth.setCustomUserClaims(user.uid, { concesionarioIds });
  }

  for (const email of removed) {
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (err) {
      if ((err as { code?: string }).code === "auth/user-not-found") continue;
      throw err;
    }
    const record = await getConcesionarioUser(user.uid);
    const concesionarioIds = (record?.concesionarioIds ?? []).filter(
      (id) => id !== concesionarioId,
    );
    await setConcesionarioUserStores(user.uid, email, concesionarioIds);
    await auth.setCustomUserClaims(user.uid, { concesionarioIds });
  }

  return { invitados: added };
}
