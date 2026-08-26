import { logger } from "firebase-functions/v2";
import { uploadDealFile } from "./files";
import { storeDealFile } from "../storage/dealFiles";
import { updateDealProperties, toHubspotDateProperty } from "./deals";
import { patchDealFields } from "../firestore/dealsRepository";

interface UploadedFile {
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
}

/**
 * Shared write-back for "Nueva cotización" (section 5.2). Stores the file
 * in two places on purpose: a copy goes to Cloud Storage (storeDealFile),
 * which is what Firestore's cotizacionUrl points to and what "Ver
 * archivo" in Paydesk opens — direct, no login required; a second copy
 * goes to HubSpot Files (uploadDealFile), and *that* URL is what's written
 * onto the HubSpot deal property, so the Aviva team sees the file without
 * leaving HubSpot. The two URLs are deliberately different for the two
 * different audiences.
 *
 * Used by both the concesionario-facing endpoint (uploadCotizacion.ts) and
 * the admin one (admin/uploadCotizacion.ts) — the only difference between
 * the two callers is who's allowed to call it, not what happens once
 * they're let through.
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

  const [hubspotFile, storageFile] = await Promise.all([
    uploadDealFile(dealId, file.fileName, file.buffer, {
      folderPath: `aviva-pay-desk/${dealId}/cotizacion`,
    }),
    storeDealFile(dealId, "cotizacion", file.fileName, file.buffer, file.mimeType),
  ]);

  await updateDealProperties(dealId, {
    // cotizacionEstatus is a HubSpot single-checkbox property: its real
    // values are "true"/"false", not "completado"/"pendiente" — see
    // hubspot/deals.ts (toUploadStatus) for the read-side of this.
    cotizacionEstatus: "true",
    // The HubSpot-hosted copy's URL — the property's own value, for the
    // team browsing this deal inside HubSpot.
    cotizacionUrl: hubspotFile.url,
    // HubSpot date property: needs midnight-UTC epoch millis, not the
    // "YYYY-MM-DD" an <input type="date"> gives us.
    cotizacionFechaEntregaAcordada: toHubspotDateProperty(fechaEntregaAcordada),
    cotizacionMontoTotalCompra: montoTotalCompra,
  });

  await patchDealFields(dealId, {
    cotizacionEstatus: "completado",
    // The Storage copy's URL — what Paydesk's own UI reads and links to.
    cotizacionUrl: storageFile.url,
    cotizacionFechaEntregaAcordada: fechaEntregaAcordada
      ? new Date(fechaEntregaAcordada).toISOString()
      : null,
    cotizacionMontoTotalCompra: montoTotalCompra ? Number(montoTotalCompra) : null,
  });

  logger.info(`writeCotizacion: completed for deal ${dealId}`);
  return { url: storageFile.url };
}

/**
 * Shared write-back for "Comprobante de entrega" (section 5.3). Mirrors
 * writeCotizacion above, including the two-URL split.
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

  const [hubspotFile, storageFile] = await Promise.all([
    uploadDealFile(dealId, file.fileName, file.buffer, {
      folderPath: `aviva-pay-desk/${dealId}/comprobante`,
    }),
    storeDealFile(dealId, "comprobante", file.fileName, file.buffer, file.mimeType),
  ]);

  await updateDealProperties(dealId, {
    // comprobanteEntregaEstatus is a HubSpot single-checkbox property:
    // its real values are "true"/"false", not "completado"/"pendiente".
    comprobanteEntregaEstatus: "true",
    // The HubSpot-hosted copy's URL — the property's own value, for the
    // team browsing this deal inside HubSpot.
    comprobanteUrl: hubspotFile.url,
    // HubSpot date property: needs midnight-UTC epoch millis, not the
    // "YYYY-MM-DD" an <input type="date"> gives us.
    comprobanteFechaEntrega: toHubspotDateProperty(fechaEntrega),
    comprobanteFirmaClienteConfirmada: firmaClienteConfirmada,
  });

  await patchDealFields(dealId, {
    comprobanteEntregaEstatus: "completado",
    // The Storage copy's URL — what Paydesk's own UI reads and links to.
    comprobanteUrl: storageFile.url,
    comprobanteFechaEntrega: fechaEntrega ? new Date(fechaEntrega).toISOString() : null,
    comprobanteFirmaClienteConfirmada: true,
  });

  logger.info(`writeComprobante: completed for deal ${dealId}`);
  return { url: storageFile.url };
}
