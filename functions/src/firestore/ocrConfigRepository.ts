import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { TTL_CONFIG_MS } from "./configCache";

const COLLECTION = "paydesk_config";
const DOC_ID = "ocr";

/**
 * - `automatico` — cada documento se verifica: lo que cuadra se acepta
 *   solo, lo que no se puede leer se rechaza y lo sospechoso queda en
 *   revisión para un administrador (ver hubspot/uploads.ts).
 * - `apagado` — interruptor de emergencia: los documentos se aceptan sin
 *   verificar, como antes de que existiera esto.
 */
export type ModoOcr = "automatico" | "apagado";

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

export const OCR_CONFIG_DEFAULT: OcrConfig = { modo: "automatico", modelo: "sonnet" };

let cached: OcrConfig | null = null;
let cacheExpira = 0;

function ocrDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export function esModoOcr(v: unknown): v is ModoOcr {
  return v === "automatico" || v === "apagado";
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
    // "observar" y "bloquear" son modos de una versión anterior: los dos
    // pasan a automático, que es lo que se pidió desde el principio.
    modo: data?.modo === "apagado" ? "apagado" : OCR_CONFIG_DEFAULT.modo,
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
