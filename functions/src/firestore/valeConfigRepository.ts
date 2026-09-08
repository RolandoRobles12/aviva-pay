import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { VALE_VIGENCIA_HORAS_DEFAULT } from "../config/fields";

const COLLECTION = "paydesk_config";
const DOC_ID = "vale";

/**
 * Lo configurable del vale, editable desde `/admin/vales` sin desplegar —
 * mismo patrón que el diccionario de campos y el rollout.
 */
export interface ValeConfig {
  /**
   * Cuántas horas dura un vale desde que se emite. Un vale sin caducidad
   * es un vale que alguien guarda: la ventana corta es la que obliga a
   * que la compra ocurra cerca de la autorización, que es cuando Aviva
   * todavía sabe que el crédito sigue siendo bueno.
   */
  vigenciaHoras: number;
}

import { TTL_CONFIG_MS } from "./configCache";

let cached: ValeConfig | null = null;
let cacheExpira = 0;

function configDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export async function getValeConfig(): Promise<ValeConfig> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getValeConfigFresh();
}

/**
 * Lee siempre de Firestore, sin pasar por el caché, y lo refresca de
 * paso. Es lo que usan las pantallas de admin: quien acaba de guardar
 * tiene que ver lo que guardó, no lo que esta instancia recuerda.
 */
export async function getValeConfigFresh(): Promise<ValeConfig> {

  const snap = await configDoc().get();
  const stored = snap.exists ? snap.data()?.vigenciaHoras : null;

  cached = {
    vigenciaHoras:
      typeof stored === "number" && stored > 0
        ? stored
        : VALE_VIGENCIA_HORAS_DEFAULT,
  };
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return cached;
}

export async function setValeConfig(
  vigenciaHoras: number,
  actualizadoPor: string,
): Promise<void> {
  await configDoc().set(
    {
      vigenciaHoras,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  cached = null;
}

/** Seam para pruebas/emulador: tira el caché de la instancia. */
export function invalidateValeConfigCache(): void {
  cached = null;
}
