import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import { getModoOcrFresh, setModoOcr, type ModoOcr } from "../../firestore/ocrConfigRepository";

export const adminGetOcr = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return { modo: await getModoOcrFresh() };
});

export const adminSetOcr = onCall<{ modo?: ModoOcr }>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const modo = request.data?.modo;
    if (modo !== "apagado" && modo !== "observar" && modo !== "bloquear") {
      throw new HttpsError("invalid-argument", "Modo de OCR inválido.");
    }
    await setModoOcr(modo, admin.email ?? admin.uid);
    logger.info(`adminSetOcr: ${modo} por ${admin.email ?? admin.uid}`);
    return { ok: true };
  },
);
