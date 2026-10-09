import { getFirestore } from "firebase-admin/firestore";

/** Cómo le fue a la última sincronización periódica; lo muestra /admin/estado. */
export interface SyncEstado {
  ultimaExito: string | null;
  ultimoIntento: string | null;
  ultimoResultado: string | null;
  ultimoError: string | null;
  /** Deals que fallaron en una corrida, con cuántas veces van: se reintentan aparte. */
  reintentos: Record<string, number>;
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
    reintentos: d.reintentos ?? {},
  };
}

export async function setSyncEstado(cambios: Partial<SyncEstado>): Promise<void> {
  // `reintentos` se reemplaza entero (con merge se mezclaría y nunca se
  // borrarían los que ya se resolvieron).
  const { reintentos, ...resto } = cambios;
  await ref().set(resto, { merge: true });
  if (reintentos !== undefined) await ref().update({ reintentos });
}
