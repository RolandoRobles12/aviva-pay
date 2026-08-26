import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "./multipart";
import { getDeal, patchDealFields } from "../firestore/dealsRepository";
import { uploadDealFile } from "../hubspot/files";
import { updateDealProperties, toHubspotDateProperty } from "../hubspot/deals";
import { verifyBearerToken } from "../auth/requestAuth";

/**
 * Handles the "Comprobante de entrega" module (section 5.3): file
 * (PDF/imagen) + fecha de entrega + confirmación de firma del cliente.
 * Mirrors uploadCotizacion.ts: writes back to HubSpot, then patches the
 * Firestore mirror so the page updates in realtime.
 */
export const uploadComprobante = onRequest(
  { region: "us-central1", secrets: ["HUBSPOT_PRIVATE_APP_TOKEN"], cors: true },
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

      const uploaded = await uploadDealFile(dealId, file.fileName, file.buffer, {
        folderPath: `aviva-pay-desk/${dealId}/comprobante`,
      });

      await updateDealProperties(dealId, {
        // comprobanteEntregaEstatus is a HubSpot single-checkbox property:
        // its real values are "true"/"false", not "completado"/"pendiente"
        // — see hubspot/deals.ts (toUploadStatus) for the read-side of this.
        comprobanteEntregaEstatus: "true",
        // comprobanteUrl is a HubSpot *file* property, which stores the
        // uploaded file's id, not a URL — HubSpot resolves the URL from the
        // id on its own side.
        comprobanteUrl: uploaded.fileId,
        // HubSpot date property: needs midnight-UTC epoch millis, not the
        // "YYYY-MM-DD" the <input type="date"> gives us — see
        // hubspot/deals.ts (toHubspotDateProperty).
        comprobanteFechaEntrega: toHubspotDateProperty(fechaEntrega),
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
    } catch (err) {
      logger.error("uploadComprobante: failed", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Error interno al subir el comprobante",
      });
    }
  },
);
