/**
 * Default field dictionary: maps every logical field Aviva Pay Desk needs
 * to its HubSpot internal property name.
 *
 * These are the *defaults*. The dictionary in effect lives in Firestore and
 * is editable from the admin panel (see
 * firestore/fieldDictionaryRepository.ts); anything the stored document
 * doesn't define falls back to the value here. That fallback is what keeps
 * a deployment working when code adds a field the stored document predates.
 *
 * STATUS: PLACEHOLDER. The names on the right are NOT real HubSpot internal
 * names yet — they mirror the labels used in the requirement doc (section 7,
 * "Modelo de datos") so the codebase has something to compile against. They
 * can be filled in either here or from the admin panel.
 */

export const HUBSPOT_DEAL_PROPERTIES = {
  // --- Concesionario ---
  // The "Kiosco" property on the deal: which Construrama store the
  // solicitud belongs to. Confirmed there's no Company (or other HubSpot
  // object) representing the concesionario — it's a plain deal property.
  //
  // Field type is *multiple checkboxes* (~481 options like `#0046 - TEQ
  // CR`), so HubSpot returns it semicolon-separated — see
  // concesionario/identity.ts, which parses it and derives both the URL id
  // and the display name.
  //
  // TODO: confirm the internal name. The label is "Kiosco", so it is
  // probably `kiosco`, but HubSpot doesn't guarantee label === internal name.
  kiosco: "TODO_kiosco",

  // --- Datos base de la solicitud ---
  cliente: "TODO_cliente",
  fechaSolicitud: "TODO_fecha_solicitud",
  montoAprobado: "TODO_monto_aprobado",
  estatusKyc: "TODO_estatus_kyc",

  // --- Cotización ---
  cotizacionEstatus: "TODO_cotizacion_estatus",
  cotizacionUrl: "TODO_cotizacion_url",
  cotizacionFechaEntregaAcordada: "TODO_cotizacion_fecha_entrega_acordada",
  cotizacionMontoTotalCompra: "TODO_cotizacion_monto_total_compra",

  // --- Crédito ---
  creditoLiberadoFecha: "TODO_credito_liberado_fecha",
  disposicionCreditoFecha: "TODO_disposicion_credito_fecha",

  // --- Comprobante de entrega ---
  comprobanteEntregaEstatus: "TODO_comprobante_entrega_estatus",
  comprobanteUrl: "TODO_comprobante_url",
  comprobanteFechaEntrega: "TODO_comprobante_fecha_entrega",
  comprobanteFirmaClienteConfirmada: "TODO_comprobante_firma_cliente_confirmada",

  // --- Desembolso ---
  desembolsoFecha: "TODO_desembolso_fecha",

  // --- Notificación (section 9) ---
  // Written onto the triggering deal the first time a given store is seen,
  // so a second HubSpot workflow can enroll on "property is known" and
  // send that store the login link and its código. The NIP is never
  // written to HubSpot — it's generated in the admin panel and delivered
  // to the store out of band. TODO: confirm the trigger mechanism and the
  // recipient contact with the HubSpot workflow owner.
  paydeskUrl: "TODO_paydesk_url",
  paydeskCodigo: "TODO_paydesk_codigo",
} as const;

export type HubspotDealPropertyKey = keyof typeof HUBSPOT_DEAL_PROPERTIES;

/**
 * Default display labels for the fields a concesionario actually sees —
 * table columns and upload form fields. Editable from the admin panel
 * (see firestore/fieldLabelsRepository.ts) so wording can match how a
 * given process talks about these fields without a deploy. Purely
 * cosmetic: renaming a label here never changes which HubSpot property it
 * reads from, whether it's required, or anything else about the logic.
 *
 * Only fields with concesionario-facing text are listed — `kiosco`, the
 * file URL fields, and the notification fields (paydeskUrl/paydeskCodigo)
 * never render as a standalone label, so they're not here.
 */
export const FIELD_LABELS: Partial<Record<HubspotDealPropertyKey, string>> = {
  cliente: "Cliente",
  fechaSolicitud: "Fecha de solicitud",
  montoAprobado: "Monto aprobado",
  estatusKyc: "Estatus de KYC",
  cotizacionEstatus: "Cotización",
  cotizacionFechaEntregaAcordada: "Fecha de entrega acordada",
  cotizacionMontoTotalCompra: "Monto total de la compra",
  creditoLiberadoFecha: "Crédito liberado",
  disposicionCreditoFecha: "Disposición del crédito",
  comprobanteEntregaEstatus: "Comprobante de entrega",
  comprobanteFechaEntrega: "Fecha de entrega",
  comprobanteFirmaClienteConfirmada:
    "Confirma que el cliente firmó el documento de entrega",
  desembolsoFecha: "Desembolso del crédito",
} as const;

export type FieldLabelKey = keyof typeof FIELD_LABELS;

/** HubSpot deal pipeline/stage this project watches (section 9). TODO: confirm real pipeline/stage IDs. */
export const HUBSPOT_PIPELINE = {
  pipelineId: "TODO_pipeline_solicitudes",
  stages: {
    // TODO: fill in with the real stage IDs once known, e.g.:
    // solicitudCreada: "TODO_stage_id",
  },
} as const;

