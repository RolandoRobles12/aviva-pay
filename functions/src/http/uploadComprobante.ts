import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "./multipart";
import { getDeal } from "../firestore/dealsRepository";
import { writeComprobante } from "../hubspot/uploads";
import { OcrRechazadoError } from "../ocr/validarDocumento";
import { AppCheckError, exigirAppCheckHttp } from "../auth/appCheck";
import { esLimiteExcedido, limitar, MENSAJE_LIMITE } from "../auth/rateLimit";
import { verifyBearerToken } from "../auth/requestAuth";

/**
 * Handles the "Comprobante de entrega" module (section 5.3). Also doubles
 * as "reemplazar comprobante" — there's no separate replace endpoint, this
 * just overwrites whatever was there before; the admin counterpart is
 * admin/uploadComprobante.ts.
 */
export const uploadComprobante = onRequest(
  {
    region: "us-central1",
    secrets: ["HUBSPOT_PRIVATE_APP_TOKEN", "ANTHROPIC_API_KEY", "SLACK_BOT_TOKEN"],
    cors: true,
    // La verificación del documento con Claude se suma a las dos subidas (HubSpot y Storage).
    timeoutSeconds: 120,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const auth = await verifyBearerToken(req);
      if (!auth?.concesionarioIds?.length) {
        res.status(401).json({ error: "Inicia sesión para continuar" });
        return;
      }
      await exigirAppCheckHttp(req);
      // Cada subida cuesta una llamada a Claude: 30 por hora por persona
      // sobra para una tienda real y corta un abuso a tiempo.
      await limitar("upload", auth.uid, { max: 30, ventanaSeg: 3600 });

      const { fields, file } = await parseMultipart(req);
      const { dealId, fechaEntrega, firmaClienteConfirmada } = fields;

      if (!dealId || !file) {
        res.status(400).json({ error: "dealId y archivo son requeridos" });
        return;
      }

      const deal = await getDeal(dealId);
      // Same response whether the deal is missing or belongs to another
      // store — a store shouldn't be able to probe for other stores' deals.
      if (!deal || !deal.concesionarioId || !auth.concesionarioIds.includes(deal.concesionarioId)) {
        res.status(404).json({ error: "Solicitud no encontrada" });
        return;
      }

      if (firmaClienteConfirmada !== "true") {
        res.status(400).json({
          error: "Debe confirmarse que el cliente firmó el documento de entrega",
        });
        return;
      }

      const { enRevision } = await writeComprobante(dealId, {
        file,
        fechaEntrega,
        firmaClienteConfirmada,
      });

      // A la tienda solo se le dice si quedó en revisión, nunca qué se
      // detectó: eso se queda para el equipo de Aviva (ver ocr/validate.ts).
      res.status(200).json({ ok: true, enRevision });
    } catch (err) {
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
      // Full detail (HubSpot's raw API error, stack, etc.) goes to the
      // Cloud Functions log for debugging — a concesionario gets a plain
      // Spanish message instead of a wall of JSON they can't act on.
      logger.error("uploadComprobante: failed", err);
      res.status(500).json({
        error:
          "No se pudo guardar el comprobante de entrega. Intenta de nuevo en unos minutos; si el problema sigue, contacta a soporte.",
      });
    }
  },
);
