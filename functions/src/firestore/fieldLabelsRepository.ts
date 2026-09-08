import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { FIELD_LABELS, type FieldLabelKey } from "../config/fields";

const COLLECTION = "paydesk_config";
const DOC_ID = "field_labels";

export type FieldLabels = Record<FieldLabelKey, string>;

/** Cached for the function instance's lifetime — same trade-off as fieldDictionaryRepository.ts. */
import { TTL_CONFIG_MS } from "./configCache";

let cached: FieldLabels | null = null;
let cacheExpira = 0;

function labelsDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

/**
 * Reads the labels in effect, falling back to the code defaults for any
 * key the stored document doesn't override.
 */
export async function getFieldLabels(): Promise<FieldLabels> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getFieldLabelsFresh();
}

/**
 * Lee siempre de Firestore, sin pasar por el caché, y lo refresca de
 * paso. Es lo que usan las pantallas de admin: quien acaba de guardar
 * tiene que ver lo que guardó, no lo que esta instancia recuerda.
 */
export async function getFieldLabelsFresh(): Promise<FieldLabels> {

  const snap = await labelsDoc().get();
  const stored = (snap.exists ? snap.data()?.etiquetas : null) ?? {};

  const resolved = { ...FIELD_LABELS } as FieldLabels;
  for (const key of Object.keys(resolved) as FieldLabelKey[]) {
    const value = stored[key];
    if (typeof value === "string" && value.trim()) {
      resolved[key] = value.trim();
    }
  }

  cached = resolved;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return resolved;
}

export async function setFieldLabels(
  etiquetas: Partial<FieldLabels>,
  actualizadoPor: string,
): Promise<void> {
  await labelsDoc().set(
    {
      etiquetas,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  cached = null;
}

/** The defaults from code, so the admin UI can show what a label falls back to. */
export function getFieldLabelsDefaults(): FieldLabels {
  return { ...FIELD_LABELS } as FieldLabels;
}
