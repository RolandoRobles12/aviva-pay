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
import { alertar } from "../notificaciones/alertas";

/** Lo que se guarda en la solicitud (`cotizacionOcr` / `comprobanteOcr`). */
export interface ResultadoOcr {
  estado: EstadoOcr | "no-verificado";
  /** Qué modelo de Claude leyó el documento. */
  modelo: ModeloOcr;
  /** Detalle de las reglas que fallaron, para que el equipo revise a mano. */
  motivos: string[];
  /** Por qué no se pudo verificar (solo `no-verificado`), para diagnosticar desde el admin. Nunca se muestra a la tienda. */
  errorTecnico?: string;
  /** Lo que Claude leyó del documento, para auditoría. */
  datos?: AnalisisDocumento;
  revisadoEn: string;
}

/**
 * El archivo claramente no sirve (ilegible, otro tipo de documento).
 * `message` es genérico y es lo que ve la tienda: le dice que hay un
 * problema y que lo vuelva a subir, sin detallar qué se detectó. `detalle`
 * lleva el motivo real, para el equipo de Aviva (Slack, logs).
 */
export class OcrRechazadoError extends Error {
  constructor(
    message: string,
    public readonly detalle: string,
  ) {
    super(message);
  }
}

/** Lo que ve la tienda cuando su documento se rechaza al subirlo. */
export function mensajeRechazoTienda(tipo: DocumentoTipo): string {
  const doc = tipo === "cotizacion" ? "la cotización" : "el comprobante de entrega";
  return (
    `Hubo un problema con el archivo y no pudimos aceptarlo. ` +
    `Revisa que sea ${doc} correcto, completo y legible, y vuelve a subirlo.`
  );
}

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
 * Lanza `OcrRechazadoError` solo cuando el archivo claramente no sirve;
 * todo lo demás regresa el resultado y quien llama decide si el documento
 * se aplica o queda en revisión.
 *
 * `esAdmin` es para el admin, que reemplaza documentos por la tienda y es
 * quien resuelve los casos dudosos: se registra el resultado pero no se le
 * rechaza.
 */
export async function validarDocumento(params: {
  tipo: DocumentoTipo;
  dealId: string;
  /** Nombre del cliente según el deal; si no se pasa, se lee del deal. */
  cliente?: string | null;
  file: { fileName: string; buffer: Buffer; mimeType?: string };
  montoDeclarado?: number | null;
  fechaDeclarada?: string | null;
  esAdmin?: boolean;
}): Promise<ResultadoOcr | null> {
  const { modo, modelo } = await getOcrConfig();
  if (modo === "apagado") return null;

  const { tipo, dealId, file } = params;
  const ahora = new Date().toISOString();

  const hash = createHash("sha256").update(file.buffer).digest("hex");

  const duplicadoEn = await buscarDuplicado(hash, dealId);

  let analisis: AnalisisDocumento;
  try {
    analisis = await analizarDocumento(tipo, file, modelo);
  } catch (err) {
    logger.error(`validarDocumento: el análisis falló para el deal ${dealId}`, err);
    await alertar(
      "verificacion",
      "La verificación automática de documentos está fallando; los documentos caen en revisión manual",
      err,
    );
    // Sin verificación automática, lo revisa una persona.
    await registrarHash(hash, dealId, tipo);
    return {
      estado: "no-verificado",
      modelo,
      motivos: [
        "El documento no se pudo verificar automáticamente.",
        ...(duplicadoEn ? [`Este mismo archivo ya se subió en otra solicitud (${duplicadoEn}).`] : []),
      ],
      errorTecnico: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      revisadoEn: ahora,
    };
  }

  const cliente =
    params.cliente !== undefined ? params.cliente : ((await getDeal(dealId))?.cliente ?? null);
  const { estado, reglas } = validarAnalisis({
    tipo,
    analisis,
    cliente,
    montoDeclarado: params.montoDeclarado,
    fechaDeclarada: params.fechaDeclarada,
    duplicadoEn,
  });

  const fallidas: ResultadoRegla[] = reglas.filter((r) => !r.ok);
  const resultado: ResultadoOcr = {
    estado,
    modelo,
    motivos: fallidas.map((r) => r.detalle),
    datos: analisis,
    revisadoEn: ahora,
  };

  logger.info(
    `validarDocumento: ${tipo} del deal ${dealId} → ${estado} (${modelo})`,
    resultado.motivos,
  );

  if (estado === "rechazado" && !params.esAdmin) {
    const rechazos = fallidas.filter((r) => r.severidad === "rechazo");
    throw new OcrRechazadoError(
      mensajeRechazoTienda(tipo),
      rechazos.map((r) => r.detalle).join(" "),
    );
  }

  // Solo se "reclama" el archivo cuando de verdad se va a guardar.
  await registrarHash(hash, dealId, tipo);
  return resultado;
}
