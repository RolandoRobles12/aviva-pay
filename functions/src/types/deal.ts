/** Estatus shown for the "Cotización" and "Comprobante de entrega" columns (section 5.1). */
export type UploadStatus = "pendiente" | "completado";

/**
 * Shape of a `paydesk_deals/{dealId}` Firestore document (section 7).
 * Field values are already translated from HubSpot's raw property strings
 * into the types the frontend needs (dates as ISO strings, numbers as
 * numbers) by hubspot/deals.ts.
 *
 * `concesionarioId` is the HubSpot company associated with the deal — the
 * page groups deals by this field so a concesionario sees every one of
 * their solicitudes in a single table (confirmed against the mockup:
 * one page per concesionario, not one page per deal).
 */
export interface PayDeskDeal {
  dealId: string;
  concesionarioId: string | null;
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

  actualizadoEn: FirebaseFirestore.Timestamp;
  creadoEn: FirebaseFirestore.Timestamp;
}

/**
 * Shape of a `paydesk_concesionarios/{concesionarioId}` document — one per
 * HubSpot company, `concesionarioId` as the document ID. Exists mainly to
 * detect "first deal ever synced for this concesionario", which is when
 * the notification workflow (section 9) should fire with the page URL.
 */
export interface PayDeskConcesionario {
  concesionarioId: string;
  nombre: string | null;
  actualizadoEn: FirebaseFirestore.Timestamp;
  creadoEn: FirebaseFirestore.Timestamp;
}
