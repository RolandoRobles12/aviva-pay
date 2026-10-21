import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { conBitacora } from "./bitacoraConfig";
import { TTL_CONFIG_MS } from "./configCache";

const COLLECTION = "paydesk_config";
const DOC_ID = "disposicion";

/**
 * De dónde sale la fecha de "Disposición del crédito":
 *
 * - `paydesk` — cuando la tienda confirma la venta con el código del
 *   cliente (`confirmarDisposicion`). Es el hecho real: el crédito se
 *   gastó en ese momento, en esa caja.
 * - `hubspot` — cuando el deal entra a la etapa de disposición en
 *   HubSpot, como era antes. Depende de que alguien (o un workflow) mueva
 *   la etapa, así que puede llegar antes de que el cliente pase a la caja
 *   o no llegar nunca.
 */
export type OrigenDisposicion = "paydesk" | "hubspot";

export const ORIGEN_DISPOSICION_DEFAULT: OrigenDisposicion = "paydesk";

export function esOrigenDisposicion(v: unknown): v is OrigenDisposicion {
  return v === "paydesk" || v === "hubspot";
}

let cached: OrigenDisposicion | null = null;
let cacheExpira = 0;

function configDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export async function getOrigenDisposicion(): Promise<OrigenDisposicion> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getOrigenDisposicionFresh();
}

/** Lee siempre de Firestore, sin caché — es lo que usa el panel. */
export async function getOrigenDisposicionFresh(): Promise<OrigenDisposicion> {
  const snap = await configDoc().get();
  const stored = snap.exists ? snap.data()?.origen : null;
  cached = esOrigenDisposicion(stored) ? stored : ORIGEN_DISPOSICION_DEFAULT;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return cached;
}

export async function setOrigenDisposicion(
  origen: OrigenDisposicion,
  actualizadoPor: string,
): Promise<void> {
  await conBitacora(configDoc(), actualizadoPor, (ref) =>
    ref.set({ origen, actualizadoPor, actualizadoEn: FieldValue.serverTimestamp() }),
  );
  cached = null;
}
