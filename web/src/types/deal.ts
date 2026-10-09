/** Resultado guardado de la verificación de un documento (ver functions/src/ocr/validarDocumento.ts). */
export interface VerificacionDocumento {
  estado: "aprobado" | "revisar" | "rechazado" | "no-verificado";
  modelo?: string;
  motivos: string[];
  motivosTienda?: string[];
  errorTecnico?: string;
  /** Lo que Claude leyó del documento (ver functions/src/ocr/analizar.ts). */
  datos?: {
    tipoDetectado?: string;
    nombreCliente?: string | null;
    montoTotal?: number | null;
    fechas?: string[];
    tieneFirma?: boolean | null;
    observaciones?: string;
  };
  revisadoEn: string;
}

/** Documento en espera de un administrador, o rechazado por uno. Ver functions/src/hubspot/uploads.ts. */
export interface RevisionDocumento {
  estado: "pendiente" | "rechazado";
  fileName: string;
  capturado: Record<string, string>;
  subidoEn: string;
  comentario?: string;
  resueltoPor?: string;
  resueltoEn?: string;
}

/**
 * Mirrors functions/src/types/deal.ts (the Firestore document shape
 * returned by the getConcesionarioDeals callable). Kept as a plain
 * duplicate for now since frontend and functions aren't in a shared
 * package yet.
 */
export type UploadStatus = "pendiente" | "completado";

export interface PayDeskConcesionario {
  concesionarioId: string;
  /** Store name as shown in the page header, e.g. `Construrama TEQ`. */
  nombre: string;
  /** Store number, e.g. `0046`. */
  numero: string | null;
}

export interface PayDeskDeal {
  dealId: string;
  concesionarioId: string | null;
  /** El crédito ya no existe: el deal entró a una etapa de cancelación en HubSpot. Lo resuelve el sync. */
  cancelado?: boolean;
  /** Cuándo entró a la etapa de cancelación, según HubSpot. */
  canceladoFecha?: string | null;
  /** Fecha de cada etapa personalizada, por id. Ausente en deals anteriores a esa función. */
  etapasExtra?: Record<string, string | null>;
  /** Qué alcanzó a pasar con el vale antes de morir — ver CanceladasPage. */
  valeResumen?: "nunca-leido" | "leido-sin-usar" | "utilizado" | "sin-vale" | null;
  kiosco: string | null;
  cliente: string | null;
  fechaSolicitud: string | null;
  montoAprobado: number | null;
  /** Date the deal entered the KYC pipeline stage in HubSpot — not a status label. */
  estatusKyc: string | null; // ISO date

  cotizacionEstatus: UploadStatus;
  cotizacionUrl: string | null;
  cotizacionFechaEntregaAcordada: string | null;
  cotizacionMontoTotalCompra: number | null;

  creditoLiberadoFecha: string | null;
  disposicionCreditoFecha: string | null;

  comprobanteEntregaEstatus: UploadStatus;
  comprobanteUrl: string | null;
  comprobanteFechaEntrega: string | null;
  comprobanteFirmaClienteConfirmada: boolean | null;
  /** Resultado de la verificación con Claude del último documento subido. Solo lo muestra el admin. */
  cotizacionOcr?: VerificacionDocumento;
  comprobanteOcr?: VerificacionDocumento;
  /** Ruta del documento vigente en Storage; "Ver archivo" pide una liga temporal con ella. */
  cotizacionPath?: string | null;
  comprobantePath?: string | null;
  /** Documento que espera aprobación de un administrador, o que uno rechazó. */
  cotizacionRevision?: RevisionDocumento | null;
  comprobanteRevision?: RevisionDocumento | null;

  desembolsoFecha: string | null;
}
