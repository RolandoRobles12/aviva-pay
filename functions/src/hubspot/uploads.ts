import { logger } from "firebase-functions/v2";
import { uploadDealFile } from "./files";
import { updateDealProperties, toHubspotDateProperty } from "./deals";
import { patchDealFields } from "../firestore/dealsRepository";

interface UploadedFile {
  fileName: string;
  buffer: Buffer;
}

/**
 * Shared write-back for "Nueva cotización" (section 5.2): uploads the file
 * to HubSpot, writes the deal properties, and mirrors the change into
 * Firestore. Used by both the concesionario-facing endpoint
 * (uploadCotizacion.ts) and the admin one (admin/uploadCotizacion.ts) — the
 * only difference between the two callers is who's allowed to call it, not
 * what happens once they're let through.
 */
export async function writeCotizacion(
  dealId: string,
  params: {
    file: UploadedFile;
    fechaEntregaAcordada: string;
    montoTotalCompra: string;
  },
): Promise<{ url: string }> {
  const { file, fechaEntregaAcordada, montoTotalCompra } = params;

  const uploaded = await uploadDealFile(dealId, file.fileName, file.buffer, {
    folderPath: `aviva-pay-desk/${dealId}/cotizacion`,
  });

  await updateDealProperties(dealId, {
    // cotizacionEstatus is a HubSpot single-checkbox property: its real
    // values are "true"/"false", not "completado"/"pendiente" — see
    // hubspot/deals.ts (toUploadStatus) for the read-side of this.
    cotizacionEstatus: "true",
    // cotizacionUrl validates as a URL property in the real portal — send
    // the file's actual URL, not its HubSpot file id.
    cotizacionUrl: uploaded.url,
    // HubSpot date property: needs midnight-UTC epoch millis, not the
    // "YYYY-MM-DD" an <input type="date"> gives us.
    cotizacionFechaEntregaAcordada: toHubspotDateProperty(fechaEntregaAcordada),
    cotizacionMontoTotalCompra: montoTotalCompra,
  });

  await patchDealFields(dealId, {
    cotizacionEstatus: "completado",
    cotizacionUrl: uploaded.url,
    cotizacionFechaEntregaAcordada: fechaEntregaAcordada
      ? new Date(fechaEntregaAcordada).toISOString()
      : null,
    cotizacionMontoTotalCompra: montoTotalCompra ? Number(montoTotalCompra) : null,
  });

  logger.info(`writeCotizacion: completed for deal ${dealId}`);
  return { url: uploaded.url };
}

/**
 * Shared write-back for "Comprobante de entrega" (section 5.3). Mirrors
 * writeCotizacion above.
 */
export async function writeComprobante(
  dealId: string,
  params: {
    file: UploadedFile;
    fechaEntrega: string;
    firmaClienteConfirmada: string;
  },
): Promise<{ url: string }> {
  const { file, fechaEntrega, firmaClienteConfirmada } = params;

  const uploaded = await uploadDealFile(dealId, file.fileName, file.buffer, {
    folderPath: `aviva-pay-desk/${dealId}/comprobante`,
  });

  await updateDealProperties(dealId, {
    // comprobanteEntregaEstatus is a HubSpot single-checkbox property:
    // its real values are "true"/"false", not "completado"/"pendiente".
    comprobanteEntregaEstatus: "true",
    // comprobanteUrl validates as a URL property in the real portal —
    // send the file's actual URL, not its HubSpot file id.
    comprobanteUrl: uploaded.url,
    // HubSpot date property: needs midnight-UTC epoch millis, not the
    // "YYYY-MM-DD" an <input type="date"> gives us.
    comprobanteFechaEntrega: toHubspotDateProperty(fechaEntrega),
    comprobanteFirmaClienteConfirmada: firmaClienteConfirmada,
  });

  await patchDealFields(dealId, {
    comprobanteEntregaEstatus: "completado",
    comprobanteUrl: uploaded.url,
    comprobanteFechaEntrega: fechaEntrega ? new Date(fechaEntrega).toISOString() : null,
    comprobanteFirmaClienteConfirmada: true,
  });

  logger.info(`writeComprobante: completed for deal ${dealId}`);
  return { url: uploaded.url };
}
