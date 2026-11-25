import { onRequest } from "firebase-functions/v2/https";
import { parseMultipart } from "./multipart";
import { unirArchivos } from "./unirArchivos";
import { getDeal } from "../firestore/dealsRepository";
import { writeCotizacion } from "../hubspot/uploads";
import { responderErrorSubida } from "./erroresSubida";
import { exigirAppCheckHttp } from "../auth/appCheck";
import { limitar } from "../auth/rateLimit";
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
      if (!auth?.concesionarioIds?.length) {
        res.status(401).json({ error: "Inicia sesión para continuar" });
        return;
      }
      await exigirAppCheckHttp(req);
      // Cada subida cuesta una llamada a Claude: 30 por hora por persona
      // sobra para una tienda real y corta un abuso a tiempo.
      await limitar("upload", auth.uid, { max: 30, ventanaSeg: 3600 });

      const { fields, files } = await parseMultipart(req);
      const { dealId, fechaEntregaAcordada, montoTotalCompra } = fields;

      if (!dealId || files.length === 0) {
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

      // Un documento ya verificado no se cambia desde la tienda: es lo que
      // sostiene el desembolso. Si hay que corregirlo, lo hace Aviva desde
      // el panel (admin/upload*.ts).
      if (deal.cotizacionEstatus === "completado") {
        res.status(409).json({
          error:
            "Este documento ya está verificado y no se puede cambiar. Si hay que corregirlo, pídelo al equipo de Aviva.",
        });
        return;
      }

      // Varios archivos (p. ej. las dos caras de una hoja) se unen en un PDF.
      const file = await unirArchivos(files);

      const { enRevision } = await writeCotizacion(dealId, {
        file,
        fechaEntregaAcordada,
        montoTotalCompra,
        solicitudManual: fields.verificacionManual === "true",
      });

      // A la tienda solo se le dice si quedó en revisión, nunca qué se
      // detectó: eso se queda para el equipo de Aviva (ver ocr/validate.ts).
      res.status(200).json({ ok: true, enRevision });
    } catch (err) {
      await responderErrorSubida(res, err, {
        funcion: "uploadCotizacion",
        etiqueta: "una cotización",
        mensaje500: "No se pudo guardar la cotización. Intenta de nuevo en unos minutos; si el problema sigue, contacta a soporte.",
      });
    }
  },
);
