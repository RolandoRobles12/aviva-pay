/** Estatus shown for the "Cotización" and "Comprobante de entrega" columns (section 5.1). */
export type UploadStatus = "pendiente" | "completado";

/**
 * Shape of a `paydesk_deals/{dealId}` Firestore document (section 7).
 * Field values are already translated from HubSpot's raw property strings
 * into the types the frontend needs (dates as ISO strings, numbers as
 * numbers) by hubspot/deals.ts.
 *
 * `concesionarioId` is the opaque, URL-safe id derived from the deal's
 * Kiosco value (see concesionario/identity.ts); `kiosco` keeps the raw
 * HubSpot value for traceability. The page groups deals by
 * `concesionarioId` so a store sees every one of their clients'
 * solicitudes in a single table (one page per concesionario, not one page
 * per deal).
 */
export interface PayDeskDeal {
  dealId: string;
  concesionarioId: string | null;
  kiosco: string | null;
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
 * Construrama store, keyed by the opaque id. Holds the store's display
 * name (shown in the page header so the concesionario can confirm they're
 * looking at their own store) and detects "first deal ever synced for this
 * store", which is when the notification workflow (section 9) fires.
 */
export interface PayDeskConcesionario {
  concesionarioId: string;
  /** Raw HubSpot Kiosco value, e.g. `#0046 - TEQ CR`. Internal, never shown to the store. */
  kiosco: string;
  /** Human-readable store name, e.g. `Construrama TEQ`. */
  nombre: string;
  /** Store number from the Kiosco option, e.g. `0046`. */
  numero: string | null;
  actualizadoEn: FirebaseFirestore.Timestamp;
  creadoEn: FirebaseFirestore.Timestamp;
}
