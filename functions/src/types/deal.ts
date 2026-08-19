/** Estatus shown for the "Cotización" and "Comprobante de entrega" columns (section 5.1). */
export type UploadStatus = "pendiente" | "completado";

/**
 * Shape of a `paydesk_deals/{dealId}` Firestore document (section 7).
 * Field values are already translated from HubSpot's raw property strings
 * into the types the frontend needs (dates as ISO strings, numbers as
 * numbers) by hubspot/deals.ts.
 */
export interface PayDeskDeal {
  dealId: string;
  cliente: string | null;
  fechaSolicitud: string | null; // ISO date
  montoAprobado: number | null;
  estatusKyc: string | null;

  cotizacionEstatus: UploadStatus;
  cotizacionUrl: string | null;
  cotizacionFechaEntregaAcordada: string | null; // ISO date
  cotizacionMontoTotalCompra: number | null;

  creditoLiberadoFecha: string | null; // ISO date
  disposicionCreditoFecha: string | null; // ISO date

  comprobanteEntregaEstatus: UploadStatus;
  comprobanteUrl: string | null;
  comprobanteFechaEntrega: string | null; // ISO date
  comprobanteFirmaClienteConfirmada: boolean | null;

  desembolsoFecha: string | null; // ISO date

  /** Set by the Cloud Function on every sync; used to detect "first sync" for the notification workflow (section 9). */
  actualizadoEn: FirebaseFirestore.Timestamp;
  creadoEn: FirebaseFirestore.Timestamp;
}
