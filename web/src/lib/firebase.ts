import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import type {
  AdminAuditEntry,
  AdminConcesionario,
  AdminUser,
  FieldDictionary,
  FieldLabels,
} from "../types/admin";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Which language Firebase renders its auth emails in (invite, password
// reset) — independent of the template's configured language in Console.
// Without this it defaults to English regardless of that setting, which is
// exactly what happened: the "Restablecer contraseña" template was already
// in español but the emails kept arriving in English.
auth.languageCode = "es";
export const db = getFirestore(app);
export const functions = getFunctions(app);

// --- Concesionario ---
//
// A concesionario user is a real Firebase Auth email/password account,
// created (bare, no usable password) the moment an admin invites their
// email to a store — see functions/src/concesionario/userSync.ts. That
// invite, and "olvidé mi contraseña" below, both work the same way: they
// call Firebase's own sendPasswordResetEmail, which is what turns a bare
// account into one the person can actually sign in with. Nothing custom
// to send that email ourselves — see the "Envío de correo" decision this
// was built around.

/**
 * Signed in, but this account isn't invited to any store — drop the
 * session rather than leave the user in a half-authenticated state the
 * page would keep rejecting. Access is granted from the admin catalog,
 * never by the app itself.
 */
async function requireConcesionarioClaim(user: User) {
  const token = await user.getIdTokenResult();
  const ids = token.claims.concesionarioIds as string[] | undefined;
  if (!ids || ids.length === 0) {
    await signOut(auth);
    throw new Error("Esta cuenta no tiene acceso a ninguna tienda todavía.");
  }
  return user;
}

/**
 * Signs a concesionario in with email + password. `recordar` picks
 * whether the session survives closing the browser (local) or ends with
 * it (session) — set before signing in, since Firebase applies
 * persistence to the sign-in call itself.
 */
export async function loginConcesionario(
  email: string,
  password: string,
  recordar: boolean,
) {
  await setPersistence(
    auth,
    recordar ? browserLocalPersistence : browserSessionPersistence,
  );
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return requireConcesionarioClaim(credential.user);
}

/**
 * "Olvidé mi contraseña" — and also what an invite becomes once the
 * invited person uses it.
 *
 * `actionCodeSettings.url` + `handleCodeInApp: true` route the email link
 * straight into RestablecerContrasenaPage (our own, Pay Desk-branded
 * screen) instead of Firebase's generic, unbranded default handler at
 * `<authDomain>/__/auth/action`.
 */
export async function enviarRestablecerContrasena(email: string) {
  await sendPasswordResetEmail(auth, email, {
    url: `${window.location.origin}/restablecer`,
    handleCodeInApp: true,
  });
}

export const getConcesionarioDealsCallable = httpsCallable<
  void,
  {
    concesionarios: PayDeskConcesionario[];
    deals: PayDeskDeal[];
    labels: FieldLabels;
    /** Rollout cutoff per store (concesionarioId → ISO date | null). */
    rolloutPorTienda: Record<string, string | null>;
  }
>(functions, "getConcesionarioDeals");

// --- Admin ---

/**
 * Signed in, but not an admin — drop the session rather than leave the
 * user in a half-authenticated state the panel would keep rejecting.
 * The `admin` claim is granted out of band (see docs/ARCHITECTURE.md —
 * "Alta de administradores"); having any account, Google or otherwise,
 * is not enough on its own.
 */
async function requireAdminClaim(user: User) {
  const token = await user.getIdTokenResult();
  if (token.claims.admin !== true) {
    await signOut(auth);
    throw new Error("Esta cuenta no tiene acceso al panel de administración.");
  }
  return user;
}

export async function loginAdmin(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return requireAdminClaim(credential.user);
}

const googleProvider = new GoogleAuthProvider();

export async function loginAdminWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return requireAdminClaim(credential.user);
}

export const adminListConcesionariosCallable = httpsCallable<
  void,
  { concesionarios: AdminConcesionario[] }
>(functions, "adminListConcesionarios");

export const adminUpdateConcesionarioCallable = httpsCallable<
  {
    concesionarioId: string;
    nombre?: string;
    /** Full replacement list of invited emails, or omit to leave untouched. */
    usuarios?: string[];
    rolloutDesde?: string | null;
  },
  { ok: true; invitados: string[] }
>(functions, "adminUpdateConcesionario");

export const adminGetFieldDictionaryCallable = httpsCallable<
  void,
  { campos: FieldDictionary; defaults: FieldDictionary }
>(functions, "adminGetFieldDictionary");

export const adminSetFieldDictionaryCallable = httpsCallable<
  { campos: FieldDictionary },
  { ok: true }
>(functions, "adminSetFieldDictionary");

export const adminListAdminsCallable = httpsCallable<
  void,
  { admins: AdminUser[]; auditLog: AdminAuditEntry[] }
>(functions, "adminListAdmins");

export const adminCreateAdminCallable = httpsCallable<
  { email: string },
  { ok: true }
>(functions, "adminCreateAdmin");

export const adminRevokeAdminCallable = httpsCallable<
  { uid: string },
  { ok: true }
>(functions, "adminRevokeAdmin");

export const adminGetConcesionarioDealsCallable = httpsCallable<
  { concesionarioId: string },
  {
    concesionario: PayDeskConcesionario;
    deals: PayDeskDeal[];
    labels: FieldLabels;
    rolloutDesde: string | null;
  }
>(functions, "adminGetConcesionarioDeals");

export const adminGetFieldLabelsCallable = httpsCallable<
  void,
  { etiquetas: FieldLabels; defaults: FieldLabels }
>(functions, "adminGetFieldLabels");

export const adminSetFieldLabelsCallable = httpsCallable<
  { etiquetas: FieldLabels },
  { ok: true }
>(functions, "adminSetFieldLabels");

// Matches the backend's timeoutSeconds (540s) — the default 70s client
// timeout would give up on a large backfill long before the function does.
export const adminSyncConstruramaCallable = httpsCallable<
  void,
  {
    ok: true;
    totalFound: number;
    synced: number;
    newStores: number;
    skippedNoConcesionario: number;
    failed: number;
  }
>(functions, "adminSyncConstrurama", { timeout: 540_000 });

export const adminGetRolloutCallable = httpsCallable<
  void,
  { fechaRollout: string | null }
>(functions, "adminGetRollout");

export const adminSetRolloutCallable = httpsCallable<
  { fechaRollout: string | null },
  { ok: true }
>(functions, "adminSetRollout");

export async function logout() {
  await signOut(auth);
}
