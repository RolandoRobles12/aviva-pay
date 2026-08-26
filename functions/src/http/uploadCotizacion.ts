import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "./multipart";
import { getDeal, patchDealFields } from "../firestore/dealsRepository";
import { uploadDealFile } from "../hubspot/files";
import { updateDealProperties, toHubspotDateProperty } from "../hubspot/deals";
import { verifyBearerToken } from "../auth/requestAuth";

/**
 * Handles the "Nueva cotización" module (section 5.2): file
 * (PDF/imagen/XML) + fecha de entrega acordada + monto total de la compra.
 * On success, uploads the file to HubSpot, writes the properties back to
 * the deal, and flips cotizacion_estatus to "completado" both in HubSpot
 * and in the Firestore mirror (so the realtime listener updates the page
 * immediately, without waiting for the next HubSpot workflow sync).
 */
export const uploadCotizacion = onRequest(
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
      const { dealId, fechaEntregaAcordada, montoTotalCompra } = fields;

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

      const uploaded = await uploadDealFile(dealId, file.fileName, file.buffer, {
        folderPath: `aviva-pay-desk/${dealId}/cotizacion`,
      });

      await updateDealProperties(dealId, {
        // cotizacionEstatus is a HubSpot single-checkbox property: its real
        // values are "true"/"false", not "completado"/"pendiente" — see
        // hubspot/deals.ts (toUploadStatus) for the read-side of this.
        cotizacionEstatus: "true",
        // cotizacionUrl validates as a URL property (confirmed against the
        // real portal: it 400s on anything without an http(s):// scheme),
        // not a HubSpot *file*-type property — send the file's actual URL,
        // not its id.
        cotizacionUrl: uploaded.url,
        // HubSpot date property: needs midnight-UTC epoch millis, not the
        // "YYYY-MM-DD" the <input type="date"> gives us — see
        // hubspot/deals.ts (toHubspotDateProperty).
        cotizacionFechaEntregaAcordada: toHubspotDateProperty(fechaEntregaAcordada),
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
    } catch (err) {
      // Full detail (HubSpot's raw API error, stack, etc.) goes to the
      // Cloud Functions log for debugging — a concesionario gets a plain
      // Spanish message instead of a wall of JSON they can't act on.
      logger.error("uploadCotizacion: failed", err);
      res.status(500).json({
        error:
          "No se pudo guardar la cotización. Intenta de nuevo en unos minutos; si el problema sigue, contacta a soporte.",
      });
    }
  },
);
