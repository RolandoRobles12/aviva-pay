import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "./multipart";
import { getDeal, patchDealFields } from "../firestore/dealsRepository";
import { uploadDealFile } from "../hubspot/files";
import { updateDealProperties } from "../hubspot/deals";

/**
 * Handles the "Comprobante de entrega" module (section 5.3): file
 * (PDF/imagen) + fecha de entrega + confirmación de firma del cliente.
 * Mirrors uploadCotizacion.ts: writes back to HubSpot, then patches the
 * Firestore mirror so the page updates in realtime.
 */
export const uploadComprobante = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { fields, file } = await parseMultipart(req);
    const { dealId, fechaEntrega, firmaClienteConfirmada } = fields;

    if (!dealId || !file) {
      res.status(400).json({ error: "dealId y archivo son requeridos" });
      return;
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }

    if (firmaClienteConfirmada !== "true") {
      res.status(400).json({
        error: "Debe confirmarse que el cliente firmó el documento de entrega",
      });
      return;
    }

    const uploaded = await uploadDealFile(dealId, file.fileName, file.buffer, {
      folderPath: `aviva-pay-desk/${dealId}/comprobante`,
    });

    await updateDealProperties(dealId, {
      comprobanteEntregaEstatus: "completado",
      comprobanteUrl: uploaded.url,
      comprobanteFechaEntrega: fechaEntrega,
      comprobanteFirmaClienteConfirmada: firmaClienteConfirmada,
    });

    await patchDealFields(dealId, {
      comprobanteEntregaEstatus: "completado",
      comprobanteUrl: uploaded.url,
      comprobanteFechaEntrega: fechaEntrega
        ? new Date(fechaEntrega).toISOString()
        : null,
      comprobanteFirmaClienteConfirmada: true,
    });

    logger.info(`uploadComprobante: completed for deal ${dealId}`);
    res.status(200).json({ ok: true, url: uploaded.url });
  },
);
