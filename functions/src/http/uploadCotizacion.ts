import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "./multipart";
import { getDeal } from "../firestore/dealsRepository";
import { writeCotizacion } from "../hubspot/uploads";
import { OcrRechazadoError } from "../ocr/validarDocumento";
import { verifyBearerToken } from "../auth/requestAuth";

/**
 * Handles the "Nueva cotización" module (section 5.2): file
 * (PDF/imagen/XML) + fecha de entrega acordada + monto total de la compra.
 * Also doubles as "reemplazar cotización" — there's no separate replace
 * endpoint, this just overwrites whatever was there before; the admin
 * counterpart is admin/uploadCotizacion.ts.
 */
export const uploadCotizacion = onRequest(
  {
    region: "us-central1",
    secrets: ["HUBSPOT_PRIVATE_APP_TOKEN", "ANTHROPIC_API_KEY"],
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

      const { url, verificacion } = await writeCotizacion(dealId, {
        file,
        fechaEntregaAcordada,
        montoTotalCompra,
      });

      res.status(200).json({
        ok: true,
        url,
        // Lo que la tienda necesita saber de la verificación; los datos que
        // leyó Claude y el error técnico se quedan en la solicitud.
        verificacion: verificacion
          ? { estado: verificacion.estado, modo: verificacion.modo, motivos: verificacion.motivos }
          : null,
      });
    } catch (err) {
      if (err instanceof OcrRechazadoError) {
        res.status(422).json({ error: err.message });
        return;
      }
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
