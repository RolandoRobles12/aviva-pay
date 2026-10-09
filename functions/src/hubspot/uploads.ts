import { logger } from "firebase-functions/v2";
import { uploadDealFile } from "./files";
import { descargar, storeDealFile } from "../storage/dealFiles";
import { updateDealProperties, toHubspotDateProperty } from "./deals";
import {
  camposOcrViejos,
  dealsCollection,
  devolverRevision,
  getDeal,
  limpiarRevisionSi,
  patchDealFields,
  tomarRevision,
} from "../firestore/dealsRepository";
import {
  OcrRechazadoError,
  validarDocumento,
  type ResultadoOcr,
} from "../ocr/validarDocumento";
import { notificar } from "../notificaciones/notificar";
import type { RevisionDocumento } from "../types/deal";
import { guardarVerificacion } from "../firestore/verificacionesRepository";
import {
  registrarEventoDocumento,
  type ResultadoEvento,
} from "../firestore/eventosDocumentoRepository";

interface UploadedFile {
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
}

export type TipoDocumento = "cotizacion" | "comprobante";

export interface ResultadoSubida {
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

/** Para las métricas; un fallo aquí nunca interrumpe una subida. */
async function registrarEvento(
  dealId: string,
  concesionarioId: string | null,
  tipo: TipoDocumento,
  resultado: ResultadoEvento,
  minutosEnRevision: number | null = null,
) {
  try {
    await registrarEventoDocumento({
      dealId,
      concesionarioId,
      tipo,
      resultado,
      minutosEnRevision,
    });
  } catch (err) {
    logger.error(`registrarEvento: no se pudo registrar ${resultado} del deal ${dealId}`, err);
  }
}

/**
 * Escribe un documento ya aceptado: copia en HubSpot Files (cuya URL va a
 * la propiedad del deal, para el equipo que trabaja en HubSpot), marca la
 * casilla en HubSpot y deja el deal en "completado" en Firestore con la
 * ruta del archivo en Storage, de la que "Ver archivo" genera una liga
 * temporal (ver http/getArchivoUrl.ts).
 *
 * No toca la revisión del deal: quien llama decide si la quita (una subida
 * nueva sí; una aprobación solo si sigue siendo la misma — ver
 * `limpiarRevisionSi`).
 */
async function aplicarDocumento(
  dealId: string,
  archivo: { fileName: string; buffer: Buffer; path: string },
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
      cotizacionPath: archivo.path,
      // La liga permanente de antes ya no se guarda (ver storage/dealFiles.ts).
      cotizacionUrl: null,
      cotizacionFechaEntregaAcordada: fechaEntregaAcordada
        ? new Date(fechaEntregaAcordada).toISOString()
        : null,
      cotizacionMontoTotalCompra: montoTotalCompra ? Number(montoTotalCompra) : null,
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
      comprobantePath: archivo.path,
      comprobanteUrl: null,
      comprobanteFechaEntrega: fechaEntrega ? new Date(fechaEntrega).toISOString() : null,
      comprobanteFirmaClienteConfirmada: true,
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
  // Se lee una sola vez y se pasa a todo lo que lo necesita.
  const deal = await getDeal(dealId);
  const concesionarioId = deal?.concesionarioId ?? null;

  let verificacion: ResultadoOcr | null;
  try {
    verificacion = await validarDocumento({
      tipo: capturado.tipo,
      dealId,
      cliente: deal?.cliente ?? null,
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
        motivo: err.detalle,
      });
      await registrarEvento(dealId, concesionarioId, capturado.tipo, "rechazado_auto");
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
  if (verificacion) {
    await guardarVerificacion({ dealId, tipo: capturado.tipo, concesionarioId, verificacion });
  }
  const campoRevision =
    capturado.tipo === "cotizacion" ? "cotizacionRevision" : "comprobanteRevision";

  const enRevision = !esAdmin && verificacion !== null && verificacion.estado !== "aprobado";

  if (enRevision) {
    const revision: RevisionDocumento = {
      estado: "pendiente",
      storagePath: storageFile.path,
      fileName: file.fileName,
      mimeType: file.mimeType ?? null,
      capturado,
      subidoEn: new Date().toISOString(),
    };
    await dealsCollection()
      .doc(dealId)
      .update({ [campoRevision]: revision, ...camposOcrViejos(capturado.tipo) });
    logger.info(`subirDocumento: ${capturado.tipo} del deal ${dealId} quedó en revisión`);
    await notificar({
      evento: "documento_en_revision",
      dealId,
      tipo: capturado.tipo,
      motivos: verificacion?.motivos ?? [],
    });
    await registrarEvento(dealId, concesionarioId, capturado.tipo, "en_revision");
    return { verificacion, enRevision: true };
  }

  await aplicarDocumento(
    dealId,
    { fileName: file.fileName, buffer: file.buffer, path: storageFile.path },
    capturado,
  );
  // Un documento nuevo aplicado reemplaza cualquier revisión anterior.
  await dealsCollection()
    .doc(dealId)
    .update({ [campoRevision]: null, ...camposOcrViejos(capturado.tipo) });
  // Las subidas del admin no cuentan para las métricas de la tienda.
  if (!esAdmin) await registrarEvento(dealId, concesionarioId, capturado.tipo, "aceptado");

  logger.info(`subirDocumento: ${capturado.tipo} del deal ${dealId} aplicado`);
  return { verificacion, enRevision: false };
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
  const resolucion = { resueltoPor, resueltoEn: new Date().toISOString() };

  // Se toma de forma atómica: si dos administradores resuelven a la vez,
  // o la tienda sube otro documento en ese momento, solo una acción gana.
  const revision = await tomarRevision(
    dealId,
    tipo,
    decision === "rechazar"
      ? { estado: "rechazado", comentario, ...resolucion }
      : { estado: "aprobando", ...resolucion },
  );
  if (!revision) {
    throw new RevisionNoPendienteError("Este documento ya no está en revisión.");
  }
  const minutos = Math.round((Date.now() - Date.parse(revision.subidoEn)) / 60_000);
  const concesionarioId = (await getDeal(dealId))?.concesionarioId ?? null;

  if (decision === "rechazar") {
    logger.info(`resolverRevision: ${tipo} del deal ${dealId} rechazado por ${resueltoPor}`);
    await registrarEvento(dealId, concesionarioId, tipo, "rechazado_admin", minutos);
    await notificar({ evento: "revision_resuelta", dealId, tipo, decision, comentario, resueltoPor });
    return;
  }

  try {
    const buffer = await descargar(revision.storagePath);
    await aplicarDocumento(
      dealId,
      { fileName: revision.fileName, buffer, path: revision.storagePath },
      revision.capturado as Capturado,
    );
  } catch (err) {
    // Que no se quede atorada en "aprobando": vuelve a la bandeja.
    await devolverRevision(dealId, tipo, revision.storagePath);
    throw err;
  }
  // Si la tienda subió otro documento mientras tanto, esa revisión nueva
  // se respeta.
  await limpiarRevisionSi(dealId, tipo, revision.storagePath);

  logger.info(`resolverRevision: ${tipo} del deal ${dealId} aprobado por ${resueltoPor}`);
  await registrarEvento(dealId, concesionarioId, tipo, "aprobado_admin", minutos);
  await notificar({ evento: "revision_resuelta", dealId, tipo, decision, comentario, resueltoPor });
}
