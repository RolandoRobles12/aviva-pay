import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "./multipart";
import { getDeal, patchDealFields } from "../firestore/dealsRepository";
import { uploadDealFile } from "../hubspot/files";
import { updateDealProperties } from "../hubspot/deals";

/**
 * Handles the "Nueva cotización" module (section 5.2): file
 * (PDF/imagen/XML) + fecha de entrega acordada + monto total de la compra.
 * On success, uploads the file to HubSpot, writes the properties back to
 * the deal, and flips cotizacion_estatus to "completado" both in HubSpot
 * and in the Firestore mirror (so the realtime listener updates the page
 * immediately, without waiting for the next HubSpot workflow sync).
 */
export const uploadCotizacion = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { fields, file } = await parseMultipart(req);
    const { dealId, fechaEntregaAcordada, montoTotalCompra } = fields;

    if (!dealId || !file) {
      res.status(400).json({ error: "dealId y archivo son requeridos" });
      return;
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }

    const uploaded = await uploadDealFile(dealId, file.fileName, file.buffer, {
      folderPath: `aviva-pay-desk/${dealId}/cotizacion`,
    });

    await updateDealProperties(dealId, {
      cotizacionEstatus: "completado",
      cotizacionUrl: uploaded.url,
      cotizacionFechaEntregaAcordada: fechaEntregaAcordada,
      cotizacionMontoTotalCompra: montoTotalCompra,
    });

    await patchDealFields(dealId, {
      cotizacionEstatus: "completado",
      cotizacionUrl: uploaded.url,
      cotizacionFechaEntregaAcordada: fechaEntregaAcordada
        ? new Date(fechaEntregaAcordada).toISOString()
        : null,
      cotizacionMontoTotalCompra: montoTotalCompra
        ? Number(montoTotalCompra)
        : null,
    });

    logger.info(`uploadCotizacion: completed for deal ${dealId}`);
    res.status(200).json({ ok: true, url: uploaded.url });
  },
);
