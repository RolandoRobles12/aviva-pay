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

/**
 * Qué modelo de Claude lee los documentos. Sonnet es el de uso normal;
 * Haiku es la alternativa más barata y rápida, por si Sonnet da problemas
 * en producción. Se cambia desde el panel, sin desplegar.
 */
export type ModeloOcr = "sonnet" | "haiku";

export interface OcrConfig {
  modo: ModoOcr;
  modelo: ModeloOcr;
}

export const OCR_CONFIG_DEFAULT: OcrConfig = { modo: "observar", modelo: "sonnet" };

let cached: OcrConfig | null = null;
let cacheExpira = 0;

function ocrDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export function esModoOcr(v: unknown): v is ModoOcr {
  return v === "apagado" || v === "observar" || v === "bloquear";
}

export function esModeloOcr(v: unknown): v is ModeloOcr {
  return v === "sonnet" || v === "haiku";
}

export async function getOcrConfig(): Promise<OcrConfig> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getOcrConfigFresh();
}

export async function getOcrConfigFresh(): Promise<OcrConfig> {
  const snap = await ocrDoc().get();
  const data = snap.exists ? snap.data() : undefined;
  const config: OcrConfig = {
    modo: esModoOcr(data?.modo) ? data.modo : OCR_CONFIG_DEFAULT.modo,
    modelo: esModeloOcr(data?.modelo) ? data.modelo : OCR_CONFIG_DEFAULT.modelo,
  };
  cached = config;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return config;
}

export async function setOcrConfig(config: OcrConfig, actualizadoPor: string): Promise<void> {
  await ocrDoc().set(
    { ...config, actualizadoPor, actualizadoEn: FieldValue.serverTimestamp() },
    { merge: true },
  );
  cached = null;
}
