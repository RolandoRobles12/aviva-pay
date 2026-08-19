import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";

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

export const getConcesionarioDealsCallable = httpsCallable<
  { concesionarioId: string },
  {
    concesionario: PayDeskConcesionario;
    deals: PayDeskDeal[];
    authToken: string;
  }
>(functions, "getConcesionarioDeals");

/** Signs the client into the scoped custom token so Firestore rules allow reading this concesionario's deals (see firestore.rules). */
export async function authenticateForConcesionario(authToken: string) {
  await signInWithCustomToken(auth, authToken);
}
