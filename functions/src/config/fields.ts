/**
 * Field dictionary: maps every logical field Aviva Pay Desk needs to its
 * real HubSpot internal property name.
 *
 * STATUS: PLACEHOLDER. The names on the right are NOT real HubSpot internal
 * names yet — they mirror the labels used in the requirement doc (section 7,
 * "Modelo de datos") so the rest of the codebase has something to compile
 * against. Replace the values below with the real internal property names
 * from the HubSpot field dictionary once it's ready; nothing else in this
 * codebase should need to change, since every read/write of a HubSpot deal
 * property goes through this map (see hubspot/deals.ts).
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
  // Written by the sync function onto the triggering deal the first time a
  // given concesionario's Firestore doc is created, so a second HubSpot
  // workflow can enroll on "property is known" and notify that deal's
  // associated contact with the page URL. TODO: confirm this is the right
  // trigger mechanism, and which contact actually receives it, with the
  // HubSpot workflow owner.
  paydeskUrl: "TODO_paydesk_url",
} as const;

export type HubspotDealPropertyKey = keyof typeof HUBSPOT_DEAL_PROPERTIES;

/** HubSpot deal pipeline/stage this project watches (section 9). TODO: confirm real pipeline/stage IDs. */
export const HUBSPOT_PIPELINE = {
  pipelineId: "TODO_pipeline_solicitudes",
  stages: {
    // TODO: fill in with the real stage IDs once known, e.g.:
    // solicitudCreada: "TODO_stage_id",
  },
} as const;

/** The list of deal properties requested from HubSpot on every sync. */
export const HUBSPOT_DEAL_PROPERTY_LIST: string[] = Object.values(
  HUBSPOT_DEAL_PROPERTIES,
);
