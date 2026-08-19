/**
 * Mirrors functions/src/types/deal.ts (the Firestore document shape
 * returned by the getConcesionarioDeals callable). Kept as a plain
 * duplicate for now since frontend and functions aren't in a shared
 * package yet.
 */
export type UploadStatus = "pendiente" | "completado";

export interface PayDeskConcesionario {
  /** Store name as shown in the page header, e.g. `Construrama TEQ`. */
  nombre: string;
  /** Store number, e.g. `0046`. */
  numero: string | null;
}

export interface PayDeskDeal {
  dealId: string;
  concesionarioId: string | null;
  kiosco: string | null;
  cliente: string | null;
  fechaSolicitud: string | null;
  montoAprobado: number | null;
  estatusKyc: string | null;

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

  desembolsoFecha: string | null;
}
