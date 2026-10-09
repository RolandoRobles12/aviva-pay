import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "../multipart";
import { getDeal } from "../../firestore/dealsRepository";
import { writeCotizacion } from "../../hubspot/uploads";
import { OcrRechazadoError } from "../../ocr/validarDocumento";
import { verifyBearerToken } from "../../auth/requestAuth";

/**
 * Admin counterpart to uploadCotizacion.ts — lets an admin replace a
 * store's cotización on its behalf (e.g. the concesionario uploaded the
 * wrong file). Same write-back (writeCotizacion), different gate: the
 * `admin` claim instead of ownership via concesionarioIds — an admin can
 * act on any deal, not just ones they're invited to.
 */
export const adminUploadCotizacion = onRequest(
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
      if (!auth?.admin) {
        res.status(401).json({ error: "Inicia sesión como administrador para continuar" });
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

      const { url, verificacion } = await writeCotizacion(dealId, {
        esAdmin: true,
        file,
        fechaEntregaAcordada,
        montoTotalCompra,
      });

      logger.info(`adminUploadCotizacion: deal ${dealId} replaced by ${auth.email ?? "admin"}`);
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
      logger.error("adminUploadCotizacion: failed", err);
      res.status(500).json({
        error: "No se pudo guardar la cotización. Intenta de nuevo en unos minutos.",
      });
    }
  },
);
