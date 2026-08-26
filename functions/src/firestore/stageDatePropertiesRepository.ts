import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  STAGE_DATE_EXTRA_PROPERTIES_DEFAULT,
  STAGE_DATE_KEYS,
  type StageDateKey,
} from "../config/fields";

const COLLECTION = "paydesk_config";
const DOC_ID = "stage_date_properties";

/** Stage-date field → ordered list of extra HubSpot properties to check (first non-empty wins). */
export type StageDateProperties = Record<StageDateKey, string[]>;

/**
 * Cached for the lifetime of the Cloud Function instance — same tradeoff
 * as fieldDictionaryRepository.ts: an edit in the admin panel takes effect
 * on new function instances rather than instantly.
 */
let cached: StageDateProperties | null = null;

function doc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

/**
 * Reads the extra stage-date properties, falling back to the defaults
 * compiled into config/fields.ts for any key the stored document doesn't
 * define.
 */
export async function getStageDateProperties(): Promise<StageDateProperties> {
  if (cached) return cached;

  const snap = await doc().get();
  const stored = (snap.exists ? snap.data()?.propiedades : null) ?? {};

  const resolved = {
    ...STAGE_DATE_EXTRA_PROPERTIES_DEFAULT,
  } as StageDateProperties;
  for (const key of STAGE_DATE_KEYS) {
    const value = stored[key];
    if (Array.isArray(value)) {
      resolved[key] = value.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      );
    }
  }

  cached = resolved;
  return resolved;
}

export async function setStageDateProperties(
  propiedades: Partial<StageDateProperties>,
  actualizadoPor: string,
): Promise<void> {
  await doc().set(
    {
      propiedades,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  cached = null;
}

/** Test/emulator seam: drops the in-process cache so the next read hits Firestore. */
export function invalidateStageDatePropertiesCache(): void {
  cached = null;
}

/** The defaults from code, so the admin UI can show what a field falls back to. */
export function getStageDatePropertiesDefaults(): StageDateProperties {
  return { ...STAGE_DATE_EXTRA_PROPERTIES_DEFAULT };
}
