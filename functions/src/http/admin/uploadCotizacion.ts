import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "../multipart";
import { getDeal } from "../../firestore/dealsRepository";
import { writeCotizacion } from "../../hubspot/uploads";
import { responderErrorSubida } from "../erroresSubida";
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
    secrets: ["HUBSPOT_PRIVATE_APP_TOKEN", "ANTHROPIC_API_KEY", "SLACK_BOT_TOKEN"],
    cors: true,
    // La verificación con Claude (hasta ~100 s en el peor caso, ver
    // ocr/analizar.ts) se suma a Storage, HubSpot y los avisos.
    timeoutSeconds: 300,
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

      const { verificacion, enRevision } = await writeCotizacion(dealId, {
        esAdmin: true,
        file,
        fechaEntregaAcordada,
        montoTotalCompra,
      });

      logger.info(`adminUploadCotizacion: deal ${dealId} replaced by ${auth.email ?? "admin"}`);
      res.status(200).json({
        ok: true,
        enRevision,
        verificacion: verificacion
          ? { estado: verificacion.estado, motivos: verificacion.motivos }
          : null,
      });
    } catch (err) {
      await responderErrorSubida(res, err, {
        funcion: "adminUploadCotizacion",
        etiqueta: "una cotización (admin)",
        mensaje500: "No se pudo guardar la cotización. Intenta de nuevo en unos minutos.",
      });
    }
  },
);
