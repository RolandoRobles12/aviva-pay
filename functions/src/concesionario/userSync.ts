import { getAuth, type UserRecord } from "firebase-admin/auth";
import {
  getConcesionarioUser,
  setConcesionarioUserStores,
} from "../firestore/concesionarioUsersRepository";

/**
 * Whether this account already has a password the person can sign in with.
 *
 * An account we created with `createUser({ email })` and nothing else has
 * no sign-in provider attached at all — the `password` provider only shows
 * up once they complete the reset link and actually set one. So this is
 * what separates "invited, never finished" from "already using Pay Desk".
 */
function yaTieneContrasena(user: UserRecord): boolean {
  return user.providerData.some((p) => p.providerId === "password");
}

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
 * Added emails are split in two, because the same person can be invited to
 * a second store and that must NOT read as a fresh invite:
 * - `invitados` — needs the email: either brand new, or invited before but
 *   never finished setting a password.
 * - `yaActivos` — already signed in with their own password. Adding them
 *   here only widens `concesionarioIds`; sending "crea tu contraseña"
 *   again would suggest the existing one stopped working.
 *
 * A user's `concesionarioIds` claim is always recomputed from the
 * reverse-index doc after either kind of change, since the same email can
 * be invited to more than one store. `setCustomUserClaims` replaces the
 * *entire* claims object, so every call here spreads the account's
 * existing claims first — otherwise inviting an Aviva admin's own email to
 * a store (e.g. to test the concesionario view) would silently wipe their
 * `admin: true` claim, and vice versa in adminCreateAdmin.
 */
export async function syncConcesionarioUsuarios(
  concesionarioId: string,
  previousEmails: string[],
  nextEmails: string[],
): Promise<{ invitados: string[]; yaActivos: string[] }> {
  const before = new Set(previousEmails);
  const after = new Set(nextEmails);
  const added = nextEmails.filter((e) => !before.has(e));
  const removed = previousEmails.filter((e) => !after.has(e));

  const auth = getAuth();
  const invitados: string[] = [];
  const yaActivos: string[] = [];

  for (const email of added) {
    let user;
    try {
      user = await auth.getUserByEmail(email);
      if (yaTieneContrasena(user)) yaActivos.push(email);
      else invitados.push(email);
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      user = await auth.createUser({ email, emailVerified: false });
      invitados.push(email);
    }
    const record = await getConcesionarioUser(user.uid);
    const ids = new Set(record?.concesionarioIds ?? []);
    ids.add(concesionarioId);
    const concesionarioIds = [...ids];
    await setConcesionarioUserStores(user.uid, email, concesionarioIds);
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, concesionarioIds });
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
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, concesionarioIds });
  }

  return { invitados, yaActivos };
}
