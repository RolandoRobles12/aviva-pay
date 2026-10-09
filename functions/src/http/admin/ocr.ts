import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import { probarConexion } from "../../ocr/analizar";

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

/**
 * Prueba que las funciones puedan hablar con Claude: que el secreto
 * ANTHROPIC_API_KEY exista en este despliegue y que la llave sea válida.
 * Es la primera causa de documentos "no verificados".
 */
export const adminProbarOcr = onCall(
  { region: "us-central1", secrets: ["ANTHROPIC_API_KEY"] },
  async (request) => {
    assertAdmin(request);
    const { modelo } = await getOcrConfigFresh();
    try {
      const nombre = await probarConexion(modelo);
      return { ok: true as const, mensaje: `Conexión correcta con ${nombre}.` };
    } catch (err) {
      logger.error("adminProbarOcr: falló", err);
      return {
        ok: false as const,
        mensaje: err instanceof Error ? err.message : "No se pudo conectar con Claude.",
      };
    }
  },
);
