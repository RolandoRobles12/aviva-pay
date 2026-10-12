import type { Response } from "express";
import { logger } from "firebase-functions/v2";
import { AppCheckError } from "../auth/appCheck";
import { esLimiteExcedido, MENSAJE_LIMITE } from "../auth/rateLimit";
import { OcrRechazadoError } from "../ocr/validarDocumento";
import { alertar } from "../notificaciones/alertas";

/**
 * Cómo responden las cuatro funciones de subida (tienda y admin,
 * cotización y comprobante) cuando algo falla, en un solo lugar para que
 * no se desincronicen:
 * - App Check inválido → 403; demasiadas subidas → 429;
 * - documento que claramente no sirve → 422 con el mensaje genérico;
 * - cualquier otra cosa → 500 con un mensaje en español, el detalle a los
 *   logs y un aviso a Slack.
 */
export async function responderErrorSubida(
  res: Response,
  err: unknown,
  opciones: { funcion: string; etiqueta: string; mensaje500: string },
): Promise<void> {
  if (err instanceof AppCheckError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (esLimiteExcedido(err)) {
    res.status(429).json({ error: MENSAJE_LIMITE });
    return;
  }
  if (err instanceof OcrRechazadoError) {
    res.status(422).json({ error: err.message });
    return;
  }
  logger.error(`${opciones.funcion}: failed`, err);
  await alertar("subida", `Falló la subida de ${opciones.etiqueta}`, err);
  res.status(500).json({ error: opciones.mensaje500 });
}
