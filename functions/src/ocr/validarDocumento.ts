import { createHash } from "crypto";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { analizarDocumento, type AnalisisDocumento } from "./analizar";
import {
  validarAnalisis,
  type DocumentoTipo,
  type EstadoOcr,
  type ResultadoRegla,
} from "./validate";
import { getOcrConfig, type ModeloOcr } from "../firestore/ocrConfigRepository";
import { getDeal } from "../firestore/dealsRepository";

/** Lo que se guarda en la solicitud (`cotizacionOcr` / `comprobanteOcr`). */
export interface ResultadoOcr {
  estado: EstadoOcr | "no-verificado";
  modo: "observar" | "bloquear";
  /** Qué modelo de Claude leyó el documento. */
  modelo: ModeloOcr;
  /** Detalle de las reglas que fallaron, para que el equipo revise a mano. */
  motivos: string[];
  /** Lo que Claude leyó del documento, para auditoría. */
  datos?: AnalisisDocumento;
  revisadoEn: string;
}

/** El documento no pasó la validación y el modo es "bloquear". `message` se le muestra a la tienda. */
export class OcrRechazadoError extends Error {}

const HASHES = "paydesk_file_hashes";

/** Si el mismo archivo ya se registró en OTRA solicitud, devuelve cuál. */
async function buscarDuplicado(hash: string, dealId: string): Promise<string | null> {
  const snap = await getFirestore().collection(HASHES).doc(hash).get();
  const previo = snap.exists ? (snap.data()?.dealId as string | undefined) : undefined;
  return previo && previo !== dealId ? previo : null;
}

async function registrarHash(hash: string, dealId: string, tipo: DocumentoTipo) {
  // create(): el primero en subir un archivo es su dueño; una subida
  // repetida a otra solicitud no lo reasigna.
  await getFirestore()
    .collection(HASHES)
    .doc(hash)
    .create({ dealId, tipo, creadoEn: FieldValue.serverTimestamp() })
    .catch(() => undefined);
}

/**
 * Lee el documento con Claude y lo contrasta con lo que Paydesk ya sabe de la
 * solicitud. Se llama ANTES de guardar nada: si se rechaza, no queda ni
 * archivo ni cambio en HubSpot.
 *
 * Falla abierto: si Claude no responde o no puede leer el formato, la subida sigue (queda
 * marcada `no-verificado`) — una caída del servicio no debe frenar la operación
 * de las tiendas.
 *
 * `puedeOmitirBloqueo` es para el admin, que reemplaza documentos por la
 * tienda y es quien resuelve los casos que la verificación no entiende: se
 * registra el resultado pero no se le rechaza.
 */
export async function validarDocumento(params: {
  tipo: DocumentoTipo;
  dealId: string;
  file: { fileName: string; buffer: Buffer; mimeType?: string };
  montoDeclarado?: number | null;
  fechaDeclarada?: string | null;
  puedeOmitirBloqueo?: boolean;
}): Promise<ResultadoOcr | null> {
  const { modo, modelo } = await getOcrConfig();
  if (modo === "apagado") return null;

  const { tipo, dealId, file } = params;
  const bloquea = modo === "bloquear" && !params.puedeOmitirBloqueo;
  const ahora = new Date().toISOString();

  const hash = createHash("sha256").update(file.buffer).digest("hex");

  const duplicadoEn = await buscarDuplicado(hash, dealId);

  let analisis: AnalisisDocumento;
  try {
    analisis = await analizarDocumento(tipo, file, modelo);
  } catch (err) {
    logger.error(`validarDocumento: el análisis falló para el deal ${dealId}`, err);
    // Un duplicado no necesita al modelo para saberse: ese sí se rechaza.
    if (duplicadoEn && bloquea) {
      throw new OcrRechazadoError(
        "No pudimos validar el documento: este mismo archivo ya se subió en otra solicitud.",
      );
    }
    await registrarHash(hash, dealId, tipo);
    return {
      estado: "no-verificado",
      modo: modo === "bloquear" ? "bloquear" : "observar",
      modelo,
      motivos: [
        "El documento no se pudo verificar automáticamente.",
        ...(duplicadoEn ? ["Este mismo archivo ya se subió en otra solicitud."] : []),
      ],
      revisadoEn: ahora,
    };
  }

  const deal = await getDeal(dealId);
  const { estado, reglas } = validarAnalisis({
    tipo,
    analisis,
    cliente: deal?.cliente ?? null,
    montoDeclarado: params.montoDeclarado,
    fechaDeclarada: params.fechaDeclarada,
    duplicadoEn,
  });

  const fallidas: ResultadoRegla[] = reglas.filter((r) => !r.ok);
  const resultado: ResultadoOcr = {
    estado,
    modo: modo === "bloquear" ? "bloquear" : "observar",
    modelo,
    motivos: fallidas.map((r) => r.detalle),
    datos: analisis,
    revisadoEn: ahora,
  };

  if (estado === "rechazado" && bloquea) {
    logger.warn(`validarDocumento: ${tipo} rechazado para el deal ${dealId}`, resultado.motivos);
    const bloqueantes = fallidas.filter((r) => r.severidad === "bloqueante");
    throw new OcrRechazadoError(
      `No pudimos validar el documento: ${bloqueantes.map((r) => r.detalle).join(" ")}`,
    );
  }

  // Solo se "reclama" el archivo cuando de verdad se va a guardar.
  await registrarHash(hash, dealId, tipo);
  return resultado;
}
