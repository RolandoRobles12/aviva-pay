import { getFirestore } from "firebase-admin/firestore";

/** Cómo le fue a la última sincronización periódica; lo muestra /admin/estado. */
export interface SyncEstado {
  ultimaExito: string | null;
  ultimoIntento: string | null;
  ultimoResultado: string | null;
  ultimoError: string | null;
}

function ref() {
  return getFirestore().collection("paydesk_config").doc("sync_estado");
}

export async function getSyncEstado(): Promise<SyncEstado> {
  const snap = await ref().get();
  const d = snap.data() ?? {};
  return {
    ultimaExito: d.ultimaExito ?? null,
    ultimoIntento: d.ultimoIntento ?? null,
    ultimoResultado: d.ultimoResultado ?? null,
    ultimoError: d.ultimoError ?? null,
  };
}

export async function setSyncEstado(cambios: Partial<SyncEstado>): Promise<void> {
  await ref().set(cambios, { merge: true });
}
