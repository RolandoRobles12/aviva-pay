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

/**
 * The two HubSpot pipelines that hold Construrama deals. `current` is what
 * every new deal uses going forward; `legacy` is HubSpot's built-in
 * "default" pipeline — obsolete, nothing new lands there, but old deals
 * still live there and need to be included when backfilling history.
 *
 * Only the bulk backfill (adminSyncConstrurama) needs this. The ongoing
 * webhook (syncDealWebhook) doesn't filter by pipeline at all — it only
 * ever gets called for deals the HubSpot Workflow itself already scoped to
 * this product, one at a time.
 */
export const HUBSPOT_PIPELINES = {
  current: "890269050",
  legacy: "default",
} as const;

/**
 * What scopes a deal to this product among others sharing the same
 * HubSpot portal, for the bulk backfill's search query.
 */
export const HUBSPOT_PRODUCT_FILTER = {
  property: "aos_product",
  value: "Construrama HomeLoan",
} as const;

/**
 * Canceled-deal stages, excluded from the backfill entirely — these
 * aren't shown to a store at all. Applies across both pipelines in one
 * list; a deal's `dealstage` only ever matches an id from its own
 * pipeline's stage set, so mixing both pipelines' ids here is harmless.
 *
 * TODO: this only keeps canceled deals out of the *initial* sync. Once a
 * deal that's already in Firestore gets canceled afterward, nothing yet
 * removes it from the store's page — a separate feature, not built yet.
 */
export const HUBSPOT_EXCLUDED_STAGES = [
  "1341580191",
  "1341580192",
  "33823869",
] as const;

/**
 * For a deal sitting in the obsolete `legacy` pipeline, these five
 * milestones' dates live under a different property than the `current`
 * pipeline's — each pipeline stage gets its own
 * `hs_v2_date_entered_<stageId>` system property, and the two pipelines
 * don't share stage ids. Only the backfill needs this fallback: the
 * ongoing webhook only ever sees deals already in the current pipeline,
 * where the regular field dictionary mapping is enough.
 */
export const LEGACY_PIPELINE_STAGE_PROPERTIES: Partial<
  Record<HubspotDealPropertyKey, string>
> = {
  fechaSolicitud: "hs_v2_date_entered_36073275",
  estatusKyc: "hs_v2_date_entered_183822132",
  creditoLiberadoFecha: "hs_v2_date_entered_33642516",
  disposicionCreditoFecha: "hs_v2_date_entered_171655337",
  desembolsoFecha: "hs_v2_date_entered_33823866",
};

