import { createHash } from "crypto";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { extraerTexto } from "./extract";
import {
  validarTexto,
  type DocumentoTipo,
  type EstadoOcr,
  type ResultadoRegla,
} from "./validate";
import { getModoOcr } from "../firestore/ocrConfigRepository";
import { getDeal } from "../firestore/dealsRepository";

/** Lo que se guarda en la solicitud (`cotizacionOcr` / `comprobanteOcr`). */
export interface ResultadoOcr {
  estado: EstadoOcr | "no-verificado";
  modo: "observar" | "bloquear";
  /** Detalle de las reglas que fallaron, para que el equipo revise a mano. */
  motivos: string[];
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
 * Lee el documento con OCR y lo contrasta con lo que Paydesk ya sabe de la
 * solicitud. Se llama ANTES de guardar nada: si se rechaza, no queda ni
 * archivo ni cambio en HubSpot.
 *
 * Falla abierto: si Cloud Vision no responde, la subida sigue (queda
 * marcada `no-verificado`) — una caída del OCR no debe frenar la operación
 * de las tiendas.
 *
 * `puedeOmitirBloqueo` es para el admin, que reemplaza documentos por la
 * tienda y es quien resuelve los casos que el OCR no entiende: se
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
  const modo = await getModoOcr();
  if (modo === "apagado") return null;

  const { tipo, dealId, file } = params;
  const bloquea = modo === "bloquear" && !params.puedeOmitirBloqueo;
  const ahora = new Date().toISOString();

  const hash = createHash("sha256").update(file.buffer).digest("hex");

  let texto: string;
  try {
    texto = await extraerTexto(file.buffer, file.mimeType, file.fileName);
  } catch (err) {
    logger.error(`validarDocumento: OCR falló para el deal ${dealId}`, err);
    return {
      estado: "no-verificado",
      modo: modo === "bloquear" ? "bloquear" : "observar",
      motivos: ["El servicio de OCR no respondió; el documento no se verificó."],
      revisadoEn: ahora,
    };
  }

  const deal = await getDeal(dealId);
  const { estado, reglas } = validarTexto({
    tipo,
    texto,
    cliente: deal?.cliente ?? null,
    montoDeclarado: params.montoDeclarado,
    fechaDeclarada: params.fechaDeclarada,
    duplicadoEn: await buscarDuplicado(hash, dealId),
  });

  const fallidas: ResultadoRegla[] = reglas.filter((r) => !r.ok);
  const resultado: ResultadoOcr = {
    estado,
    modo: modo === "bloquear" ? "bloquear" : "observar",
    motivos: fallidas.map((r) => r.detalle),
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
