import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import type {
  AdminConcesionario,
  FieldDictionary,
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
export const db = getFirestore(app);
export const functions = getFunctions(app);

// --- Concesionario ---

const loginConcesionarioCallable = httpsCallable<
  { codigo: string; nip: string },
  { authToken: string; concesionario: PayDeskConcesionario }
>(functions, "loginConcesionario");

/** Exchanges código + NIP for a scoped session. Throws with the backend's message on bad credentials or lockout. */
export async function loginConcesionario(codigo: string, nip: string) {
  const result = await loginConcesionarioCallable({ codigo, nip });
  await signInWithCustomToken(auth, result.data.authToken);
  return result.data.concesionario;
}

export const getConcesionarioDealsCallable = httpsCallable<
  void,
  { concesionario: PayDeskConcesionario; deals: PayDeskDeal[] }
>(functions, "getConcesionarioDeals");

// --- Admin ---

export async function loginAdmin(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdTokenResult();
  if (token.claims.admin !== true) {
    // Signed in, but not an admin — drop the session rather than leave the
    // user in a half-authenticated state the panel would keep rejecting.
    await signOut(auth);
    throw new Error("Esta cuenta no tiene acceso al panel de administración.");
  }
  return credential.user;
}

export const adminListConcesionariosCallable = httpsCallable<
  void,
  { concesionarios: AdminConcesionario[] }
>(functions, "adminListConcesionarios");

export const adminUpdateConcesionarioCallable = httpsCallable<
  { concesionarioId: string; nombre?: string; codigo?: string },
  { ok: true }
>(functions, "adminUpdateConcesionario");

export const adminGenerarNipCallable = httpsCallable<
  { concesionarioId: string },
  { nip: string }
>(functions, "adminGenerarNip");

export const adminGetFieldDictionaryCallable = httpsCallable<
  void,
  { campos: FieldDictionary; defaults: FieldDictionary }
>(functions, "adminGetFieldDictionary");

export const adminSetFieldDictionaryCallable = httpsCallable<
  { campos: FieldDictionary },
  { ok: true }
>(functions, "adminSetFieldDictionary");

export async function logout() {
  await signOut(auth);
}
