import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import {
  getFieldLabels,
  getFieldLabelsDefaults,
  setFieldLabels,
  type FieldLabels,
} from "../../firestore/fieldLabelsRepository";

/** Returns the labels in effect plus the code defaults, so the UI can show what each falls back to. */
export const adminGetFieldLabels = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return {
    etiquetas: await getFieldLabels(),
    defaults: getFieldLabelsDefaults(),
  };
});

interface SetRequest {
  etiquetas?: Partial<FieldLabels>;
}

/**
 * Saves the display labels a concesionario sees. Purely cosmetic — unlike
 * the field dictionary, a bad value here can't break the sync, it can
 * only read oddly, so this validates far less strictly.
 */
export const adminSetFieldLabels = onCall<SetRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const etiquetas = request.data?.etiquetas;

    if (!etiquetas || typeof etiquetas !== "object") {
      throw new HttpsError("invalid-argument", "etiquetas es requerido");
    }

    const known = Object.keys(getFieldLabelsDefaults());
    const limpio: Record<string, string> = {};

    for (const [key, value] of Object.entries(etiquetas)) {
      if (!known.includes(key)) {
        throw new HttpsError("invalid-argument", `Campo desconocido: ${key}`);
      }
      if (typeof value !== "string" || !value.trim()) {
        throw new HttpsError(
          "invalid-argument",
          `La etiqueta de "${key}" no puede estar vacía.`,
        );
      }
      limpio[key] = value.trim();
    }

    await setFieldLabels(limpio as Partial<FieldLabels>, admin.email ?? admin.uid);
    logger.info(`adminSetFieldLabels: updated by ${admin.email ?? admin.uid}`);

    return { ok: true };
  },
);
