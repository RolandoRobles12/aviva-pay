import { getFirestore, FieldValue } from "firebase-admin/firestore";

const COLLECTION = "paydesk_config";
const DOC_ID = "rollout";

/**
 * The cutoff that separates solicitudes Paydesk is responsible for from
 * the ones that predate it.
 *
 * Deals approved BEFORE this date are historical: their sale already
 * happened outside Paydesk, so there is no cotización or comprobante
 * left to upload and the store must never be nagged for one. Deals
 * approved ON or AFTER it are live: those are the ones the store is asked
 * to complete.
 *
 * `null` means "not rolled out yet" — and that is deliberately the safe
 * default. With no date set, every deal reads as historical, so nobody
 * gets chased for paperwork that doesn't exist. Uploading still works on
 * any deal; the cutoff governs what is *demanded*, never what is
 * *allowed* (see `esHistorica` on the web side).
 */
export interface RolloutConfig {
  /** ISO date (YYYY-MM-DD), or null while the rollout date is still undecided. */
  fechaRollout: string | null;
}

import { TTL_CONFIG_MS } from "./configCache";

let cached: RolloutConfig | null = null;
let cacheExpira = 0;

function rolloutDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export async function getRollout(): Promise<RolloutConfig> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getRolloutFresh();
}

/**
 * Lee siempre de Firestore, sin pasar por el caché, y lo refresca de
 * paso. Es lo que usan las pantallas de admin: quien acaba de guardar
 * tiene que ver lo que guardó, no lo que esta instancia recuerda.
 */
export async function getRolloutFresh(): Promise<RolloutConfig> {

  const snap = await rolloutDoc().get();
  const stored = snap.exists ? snap.data()?.fechaRollout : null;

  cached = {
    fechaRollout: typeof stored === "string" && stored.trim() ? stored : null,
  };
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return cached;
}

export async function setRollout(
  fechaRollout: string | null,
  actualizadoPor: string,
): Promise<void> {
  await rolloutDoc().set(
    {
      fechaRollout,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  cached = null;
}

/** Test/emulator seam: drops the in-process cache so the next read hits Firestore. */
export function invalidateRolloutCache(): void {
  cached = null;
}

/**
 * The cutoff that applies to one store: its own `rolloutDesde` when set,
 * otherwise the global date. Stores go live in waves rather than all at
 * once, so a store onboarded later shouldn't inherit an earlier cutoff
 * and suddenly owe uploads for deals that closed before its own kickoff.
 */
export function resolveRolloutForStore(
  global: RolloutConfig,
  storeRolloutDesde: string | null | undefined,
): string | null {
  return storeRolloutDesde ?? global.fechaRollout;
}
