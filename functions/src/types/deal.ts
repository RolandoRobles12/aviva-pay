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
  /** Date the deal entered the KYC pipeline stage in HubSpot — not a status label. */
  estatusKyc: string | null; // ISO date

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
 * Construrama store, created automatically the first time a deal for that
 * Kiosco syncs. Holds the store's display name and who can sign in to it.
 *
 * Identity itself lives in Firebase Auth (email/password) plus
 * `paydesk_concesionario_users/{uid}`, which is the reverse index (uid →
 * every store that uid can see) that custom claims are computed from —
 * see concesionario/userSync.ts. `usuarios` here is only the forward
 * direction (this store's invited emails), edited from the admin catalog.
 */
export interface PayDeskConcesionario {
  concesionarioId: string;
  /** Raw HubSpot Kiosco value, e.g. `#0046 - TEQ CR`. Internal, never shown to the store. */
  kiosco: string;
  /**
   * Store name shown to the concesionario. Seeded from the Kiosco value
   * (`Construrama TEQ`) and overridable from the admin catalog with the
   * store's real name.
   */
  nombre: string;
  /** Store number from the Kiosco option, e.g. `0046`. */
  numero: string | null;

  /** Emails invited to sign in to this store, lowercased. A store can have more than one. */
  usuarios: string[];

  /**
   * This store's own rollout cutoff (ISO date), when it went live in a
   * different wave than the rest. Null falls back to the global date —
   * see firestore/rolloutRepository.ts.
   */
  rolloutDesde?: string | null;

  actualizadoEn: FirebaseFirestore.Timestamp;
  creadoEn: FirebaseFirestore.Timestamp;
}

/** The subset of a concesionario that is safe to send to a client. */
export interface PayDeskConcesionarioPublico {
  concesionarioId: string;
  nombre: string;
  numero: string | null;
}
