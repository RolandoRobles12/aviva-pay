import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  HUBSPOT_DEAL_PROPERTIES,
  type HubspotDealPropertyKey,
} from "../config/fields";

const COLLECTION = "paydesk_config";
const DOC_ID = "field_dictionary";

/** Logical field name → HubSpot internal property name. */
export type FieldDictionary = Record<HubspotDealPropertyKey, string>;

/**
 * Cached for the lifetime of the Cloud Function instance. Every deal sync
 * needs the dictionary, and re-reading it on each webhook call would add a
 * Firestore round trip to a hot path for data that changes maybe twice a
 * year. The trade-off is that an edit in the admin panel takes effect on
 * new function instances rather than instantly — acceptable, and noted in
 * the admin UI.
 */
let cached: FieldDictionary | null = null;

function dictionaryDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

/**
 * Reads the dictionary, falling back to the defaults compiled into
 * `config/fields.ts` for any key the stored document doesn't define. That
 * fallback means adding a new field in code doesn't break a deployment
 * whose Firestore document predates it.
 */
export async function getFieldDictionary(): Promise<FieldDictionary> {
  if (cached) return cached;

  const snap = await dictionaryDoc().get();
  const stored = (snap.exists ? snap.data()?.campos : null) ?? {};

  const resolved = { ...HUBSPOT_DEAL_PROPERTIES } as FieldDictionary;
  for (const key of Object.keys(resolved) as HubspotDealPropertyKey[]) {
    const value = stored[key];
    if (typeof value === "string" && value.trim()) {
      resolved[key] = value.trim();
    }
  }

  cached = resolved;
  return resolved;
}

export async function setFieldDictionary(
  campos: Partial<FieldDictionary>,
  actualizadoPor: string,
): Promise<void> {
  await dictionaryDoc().set(
    {
      campos,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  cached = null;
}

/** Test/emulator seam: drops the in-process cache so the next read hits Firestore. */
export function invalidateFieldDictionaryCache(): void {
  cached = null;
}

/** The defaults from code, so the admin UI can show what a field falls back to. */
export function getFieldDictionaryDefaults(): FieldDictionary {
  return { ...HUBSPOT_DEAL_PROPERTIES } as FieldDictionary;
}
