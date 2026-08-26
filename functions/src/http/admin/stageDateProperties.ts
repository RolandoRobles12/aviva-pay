import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import { STAGE_DATE_KEYS } from "../../config/fields";
import {
  getStageDateProperties,
  getStageDatePropertiesDefaults,
  setStageDateProperties,
  type StageDateProperties,
} from "../../firestore/stageDatePropertiesRepository";

/** Returns the extra stage-date properties in effect plus the code defaults, so the UI can show what each field falls back to. */
export const adminGetStageDateProperties = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);
    return {
      propiedades: await getStageDateProperties(),
      defaults: getStageDatePropertiesDefaults(),
    };
  },
);

interface SetRequest {
  propiedades?: Partial<Record<string, string[]>>;
}

/**
 * Saves the extra HubSpot properties checked for each milestone date.
 * Same validation posture as adminSetFieldDictionary — a typo'd key or a
 * non-list value would otherwise sit in Firestore doing nothing while the
 * admin believed it had taken effect.
 */
export const adminSetStageDateProperties = onCall<SetRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const propiedades = request.data?.propiedades;

    if (!propiedades || typeof propiedades !== "object") {
      throw new HttpsError("invalid-argument", "propiedades es requerido");
    }

    const known = new Set<string>(STAGE_DATE_KEYS);
    const limpio: Partial<StageDateProperties> = {};

    for (const [key, value] of Object.entries(propiedades)) {
      if (!known.has(key)) {
        throw new HttpsError("invalid-argument", `Campo desconocido: ${key}`);
      }
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new HttpsError(
          "invalid-argument",
          `El campo "${key}" debe ser una lista de nombres de propiedad.`,
        );
      }
      limpio[key as keyof StageDateProperties] = value
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }

    await setStageDateProperties(limpio, admin.email ?? admin.uid);
    logger.info(
      `adminSetStageDateProperties: updated by ${admin.email ?? admin.uid}`,
    );

    return { ok: true };
  },
);
