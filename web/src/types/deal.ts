/**
 * Mirrors functions/src/types/deal.ts (the Firestore document shape
 * returned by the getDealStatus callable). Kept as a plain duplicate for
 * now since frontend and functions aren't in a shared package yet.
 */
export type UploadStatus = "pendiente" | "completado";

export interface PayDeskDeal {
  dealId: string;
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
