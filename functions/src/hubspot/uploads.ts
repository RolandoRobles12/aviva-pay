import { logger } from "firebase-functions/v2";
import { getStorage } from "firebase-admin/storage";
import { uploadDealFile } from "./files";
import { storeDealFile } from "../storage/dealFiles";
import { updateDealProperties, toHubspotDateProperty } from "./deals";
import { getDeal, patchDealFields } from "../firestore/dealsRepository";
import {
  OcrRechazadoError,
  validarDocumento,
  type ResultadoOcr,
} from "../ocr/validarDocumento";
import { notificar } from "../notificaciones/notificar";
import type { RevisionDocumento } from "../types/deal";

interface UploadedFile {
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
}

export type TipoDocumento = "cotizacion" | "comprobante";

export interface ResultadoSubida {
  url: string;
  verificacion: ResultadoOcr | null;
  /** El documento se guardó pero espera la aprobación de un administrador. */
  enRevision: boolean;
}

/**
 * Lo que la tienda capturó junto con el archivo. Viaja con la revisión
 * para poder aplicarlo tal cual si el administrador la aprueba.
 */
type Capturado =
  | { tipo: "cotizacion"; fechaEntregaAcordada: string; montoTotalCompra: string }
  | { tipo: "comprobante"; fechaEntrega: string; firmaClienteConfirmada: string };

/**
 * Escribe un documento ya aceptado: copia en HubSpot Files (cuya URL va a
 * la propiedad del deal, para el equipo que trabaja en HubSpot), marca la
 * casilla en HubSpot y deja el deal en "completado" en Firestore con la
 * URL de Storage (la que abre "Ver archivo" en Paydesk). Las dos URLs son
 * distintas a propósito: cada una es para un público distinto.
 */
async function aplicarDocumento(
  dealId: string,
  archivo: { fileName: string; buffer: Buffer; storageUrl: string },
  capturado: Capturado,
): Promise<void> {
  const hubspotFile = await uploadDealFile(dealId, archivo.fileName, archivo.buffer, {
    folderPath: `aviva-pay-desk/${dealId}/${capturado.tipo}`,
  });

  if (capturado.tipo === "cotizacion") {
    const { fechaEntregaAcordada, montoTotalCompra } = capturado;
    await updateDealProperties(dealId, {
      // Casilla de HubSpot: sus valores reales son "true"/"false", no
      // "completado"/"pendiente" — ver toUploadStatus en hubspot/deals.ts.
      cotizacionEstatus: "true",
      cotizacionUrl: hubspotFile.url,
      // Propiedad de fecha: medianoche UTC en epoch millis.
      cotizacionFechaEntregaAcordada: toHubspotDateProperty(fechaEntregaAcordada),
      cotizacionMontoTotalCompra: montoTotalCompra,
    });
    await patchDealFields(dealId, {
      cotizacionEstatus: "completado",
      cotizacionUrl: archivo.storageUrl,
      cotizacionFechaEntregaAcordada: fechaEntregaAcordada
        ? new Date(fechaEntregaAcordada).toISOString()
        : null,
      cotizacionMontoTotalCompra: montoTotalCompra ? Number(montoTotalCompra) : null,
      cotizacionRevision: null,
    });
  } else {
    const { fechaEntrega, firmaClienteConfirmada } = capturado;
    await updateDealProperties(dealId, {
      comprobanteEntregaEstatus: "true",
      comprobanteUrl: hubspotFile.url,
      comprobanteFechaEntrega: toHubspotDateProperty(fechaEntrega),
      comprobanteFirmaClienteConfirmada: firmaClienteConfirmada,
    });
    await patchDealFields(dealId, {
      comprobanteEntregaEstatus: "completado",
      comprobanteUrl: archivo.storageUrl,
      comprobanteFechaEntrega: fechaEntrega ? new Date(fechaEntrega).toISOString() : null,
      comprobanteFirmaClienteConfirmada: true,
      comprobanteRevision: null,
    });
  }
}

/**
 * El flujo de subida de cotización y comprobante, para la tienda y para el
 * admin:
 *
 * 1. Claude verifica el documento (ocr/validarDocumento.ts). Si claramente
 *    no sirve, se rechaza ahí mismo y no se guarda nada.
 * 2. El archivo se guarda en Storage.
 * 3. Si la verificación salió limpia (o lo sube un admin, o la verificación
 *    está apagada), se aplica: HubSpot + deal en "completado".
 * 4. Si algo no cuadró, el documento queda **en revisión**: guardado, pero
 *    sin tocar HubSpot ni marcar el paso como completado, hasta que un
 *    administrador lo apruebe desde /admin/revision (`resolverRevision`).
 */
async function subirDocumento(
  dealId: string,
  file: UploadedFile,
  capturado: Capturado,
  esAdmin: boolean,
): Promise<ResultadoSubida> {
  let verificacion: ResultadoOcr | null;
  try {
    verificacion = await validarDocumento({
      tipo: capturado.tipo,
      dealId,
      file,
      ...(capturado.tipo === "cotizacion"
        ? { montoDeclarado: capturado.montoTotalCompra ? Number(capturado.montoTotalCompra) : null }
        : { fechaDeclarada: capturado.fechaEntrega || null }),
      esAdmin,
    });
  } catch (err) {
    if (err instanceof OcrRechazadoError) {
      await notificar({
        evento: "documento_rechazado",
        dealId,
        tipo: capturado.tipo,
        motivo: err.message,
      });
    }
    throw err;
  }

  const storageFile = await storeDealFile(
    dealId,
    capturado.tipo,
    file.fileName,
    file.buffer,
    file.mimeType,
  );
  const campoOcr = capturado.tipo === "cotizacion" ? "cotizacionOcr" : "comprobanteOcr";
  const campoRevision =
    capturado.tipo === "cotizacion" ? "cotizacionRevision" : "comprobanteRevision";

  const enRevision = !esAdmin && verificacion !== null && verificacion.estado !== "aprobado";

  if (enRevision) {
    const revision: RevisionDocumento = {
      estado: "pendiente",
      storagePath: storageFile.path,
      url: storageFile.url,
      fileName: file.fileName,
      mimeType: file.mimeType ?? null,
      capturado,
      subidoEn: new Date().toISOString(),
    };
    await patchDealFields(dealId, { [campoOcr]: verificacion, [campoRevision]: revision });
    logger.info(`subirDocumento: ${capturado.tipo} del deal ${dealId} quedó en revisión`);
    await notificar({
      evento: "documento_en_revision",
      dealId,
      tipo: capturado.tipo,
      motivos: verificacion?.motivos ?? [],
    });
    return { url: storageFile.url, verificacion, enRevision: true };
  }

  await aplicarDocumento(
    dealId,
    { fileName: file.fileName, buffer: file.buffer, storageUrl: storageFile.url },
    capturado,
  );
  if (verificacion) await patchDealFields(dealId, { [campoOcr]: verificacion });

  logger.info(`subirDocumento: ${capturado.tipo} del deal ${dealId} aplicado`);
  return { url: storageFile.url, verificacion, enRevision: false };
}

export function writeCotizacion(
  dealId: string,
  params: {
    file: UploadedFile;
    fechaEntregaAcordada: string;
    montoTotalCompra: string;
    /** Admin: se verifica y se registra, pero se aplica directo. */
    esAdmin?: boolean;
  },
): Promise<ResultadoSubida> {
  return subirDocumento(
    dealId,
    params.file,
    {
      tipo: "cotizacion",
      fechaEntregaAcordada: params.fechaEntregaAcordada,
      montoTotalCompra: params.montoTotalCompra,
    },
    params.esAdmin ?? false,
  );
}

export function writeComprobante(
  dealId: string,
  params: {
    file: UploadedFile;
    fechaEntrega: string;
    firmaClienteConfirmada: string;
    /** Admin: se verifica y se registra, pero se aplica directo. */
    esAdmin?: boolean;
  },
): Promise<ResultadoSubida> {
  return subirDocumento(
    dealId,
    params.file,
    {
      tipo: "comprobante",
      fechaEntrega: params.fechaEntrega,
      firmaClienteConfirmada: params.firmaClienteConfirmada,
    },
    params.esAdmin ?? false,
  );
}

/** El documento ya no espera revisión (otro admin lo resolvió, o la tienda subió otro). */
export class RevisionNoPendienteError extends Error {}

/**
 * Lo que decide un administrador sobre un documento en revisión. Aprobar
 * lo aplica exactamente como si hubiera pasado la verificación; rechazar
 * lo deja visible para la tienda con el comentario, y el paso sigue
 * pendiente para que suba otro.
 */
export async function resolverRevision(params: {
  dealId: string;
  tipo: TipoDocumento;
  decision: "aprobar" | "rechazar";
  comentario: string;
  resueltoPor: string;
}): Promise<void> {
  const { dealId, tipo, decision, comentario, resueltoPor } = params;
  const deal = await getDeal(dealId);
  const revision = tipo === "cotizacion" ? deal?.cotizacionRevision : deal?.comprobanteRevision;
  if (!revision || revision.estado !== "pendiente") {
    throw new RevisionNoPendienteError("Este documento ya no está en revisión.");
  }
  const campoRevision = tipo === "cotizacion" ? "cotizacionRevision" : "comprobanteRevision";

  if (decision === "rechazar") {
    await patchDealFields(dealId, {
      [campoRevision]: {
        ...revision,
        estado: "rechazado",
        comentario,
        resueltoPor,
        resueltoEn: new Date().toISOString(),
      },
    });
    logger.info(`resolverRevision: ${tipo} del deal ${dealId} rechazado por ${resueltoPor}`);
    await notificar({ evento: "revision_resuelta", dealId, tipo, decision, comentario, resueltoPor });
    return;
  }

  const [buffer] = await getStorage().bucket().file(revision.storagePath).download();
  await aplicarDocumento(
    dealId,
    { fileName: revision.fileName, buffer, storageUrl: revision.url },
    revision.capturado as Capturado,
  );
  logger.info(`resolverRevision: ${tipo} del deal ${dealId} aprobado por ${resueltoPor}`);
  await notificar({ evento: "revision_resuelta", dealId, tipo, decision, comentario, resueltoPor });
}
