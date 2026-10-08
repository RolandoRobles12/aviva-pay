import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { TTL_CONFIG_MS } from "./configCache";

const COLLECTION = "paydesk_config";
const DOC_ID = "ocr";

/**
 * - `apagado` — no se lee ningún documento.
 * - `observar` — se lee y se guarda el resultado en la solicitud, pero
 *   nunca se rechaza una subida. Sirve para medir falsos positivos antes
 *   de bloquear.
 * - `bloquear` — un documento con una regla bloqueante fallida se rechaza.
 */
export type ModoOcr = "apagado" | "observar" | "bloquear";

export const MODO_OCR_DEFAULT: ModoOcr = "observar";

let cached: ModoOcr | null = null;
let cacheExpira = 0;

function ocrDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export async function getModoOcr(): Promise<ModoOcr> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getModoOcrFresh();
}

export async function getModoOcrFresh(): Promise<ModoOcr> {
  const snap = await ocrDoc().get();
  const stored = snap.exists ? snap.data()?.modo : null;
  const modo: ModoOcr =
    stored === "apagado" || stored === "observar" || stored === "bloquear"
      ? stored
      : MODO_OCR_DEFAULT;
  cached = modo;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return modo;
}

export async function setModoOcr(modo: ModoOcr, actualizadoPor: string): Promise<void> {
  await ocrDoc().set(
    { modo, actualizadoPor, actualizadoEn: FieldValue.serverTimestamp() },
    { merge: true },
  );
  cached = null;
}
