import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import {
  getFieldDictionary,
  getFieldDictionaryDefaults,
  setFieldDictionary,
  type FieldDictionary,
} from "../../firestore/fieldDictionaryRepository";

/** Returns the dictionary in effect plus the code defaults, so the UI can show what each field falls back to. */
export const adminGetFieldDictionary = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);
    return {
      campos: await getFieldDictionary(),
      defaults: getFieldDictionaryDefaults(),
    };
  },
);

interface SetRequest {
  campos?: Partial<FieldDictionary>;
}

/**
 * Saves the HubSpot property mapping. Editing this wrong breaks the sync
 * for every store, so the UI warns before saving and this validates that
 * values are non-empty strings under known keys — a typo'd key would
 * otherwise sit in Firestore doing nothing while the admin believed it
 * had taken effect.
 */
export const adminSetFieldDictionary = onCall<SetRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const campos = request.data?.campos;

    if (!campos || typeof campos !== "object") {
      throw new HttpsError("invalid-argument", "campos es requerido");
    }

    const known = Object.keys(getFieldDictionaryDefaults());
    const limpio: Record<string, string> = {};

    for (const [key, value] of Object.entries(campos)) {
      if (!known.includes(key)) {
        throw new HttpsError("invalid-argument", `Campo desconocido: ${key}`);
      }
      if (typeof value !== "string" || !value.trim()) {
        throw new HttpsError(
          "invalid-argument",
          `El campo "${key}" no puede estar vacío.`,
        );
      }
      limpio[key] = value.trim();
    }

    await setFieldDictionary(
      limpio as Partial<FieldDictionary>,
      admin.email ?? admin.uid,
    );
    logger.info(
      `adminSetFieldDictionary: updated by ${admin.email ?? admin.uid}`,
    );

    return { ok: true };
  },
);
