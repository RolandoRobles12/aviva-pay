import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import {
  esModeloOcr,
  esModoOcr,
  getOcrConfigFresh,
  setOcrConfig,
  type ModeloOcr,
  type ModoOcr,
} from "../../firestore/ocrConfigRepository";

export const adminGetOcr = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return await getOcrConfigFresh();
});

export const adminSetOcr = onCall<{ modo?: ModoOcr; modelo?: ModeloOcr }>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const { modo, modelo } = request.data ?? {};
    if (!esModoOcr(modo)) {
      throw new HttpsError("invalid-argument", "Modo de verificación inválido.");
    }
    if (!esModeloOcr(modelo)) {
      throw new HttpsError("invalid-argument", "Modelo inválido.");
    }
    await setOcrConfig({ modo, modelo }, admin.email ?? admin.uid);
    logger.info(`adminSetOcr: ${modo}/${modelo} por ${admin.email ?? admin.uid}`);
    return { ok: true };
  },
);
