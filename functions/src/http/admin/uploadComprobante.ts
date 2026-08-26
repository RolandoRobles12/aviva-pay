import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { parseMultipart } from "../multipart";
import { getDeal } from "../../firestore/dealsRepository";
import { writeComprobante } from "../../hubspot/uploads";
import { verifyBearerToken } from "../../auth/requestAuth";

/**
 * Admin counterpart to uploadComprobante.ts — lets an admin replace a
 * store's comprobante de entrega on its behalf. Same write-back
 * (writeComprobante), different gate: the `admin` claim instead of
 * ownership via concesionarioIds.
 */
export const adminUploadComprobante = onRequest(
  { region: "us-central1", secrets: ["HUBSPOT_PRIVATE_APP_TOKEN"], cors: true },
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

      const { url } = await writeComprobante(dealId, {
        file,
        fechaEntrega,
        firmaClienteConfirmada,
      });

      logger.info(`adminUploadComprobante: deal ${dealId} replaced by ${auth.email ?? "admin"}`);
      res.status(200).json({ ok: true, url });
    } catch (err) {
      logger.error("adminUploadComprobante: failed", err);
      res.status(500).json({
        error: "No se pudo guardar el comprobante de entrega. Intenta de nuevo en unos minutos.",
      });
    }
  },
);
