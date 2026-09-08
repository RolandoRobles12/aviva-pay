/**
 * Default field dictionary: maps every logical field Aviva Paydesk needs
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

  // --- Vale de un solo uso ---
  // El código que el cliente presenta en la caja y su liga, escritos de
  // vuelta al deal para que (a) el equipo de Aviva los vea sin salir del
  // CRM y (b) el workflow de HubSpot mande la liga por WhatsApp. La
  // disposición confirmada por la tienda regresa por los otros tres.
  //
  // Son solo tres, y es a propósito. El monto dispuesto y la fecha de
  // disposición NO se escriben desde Paydesk:
  //
  // - La **fecha** ya la estampa HubSpot solo, al entrar el deal a la
  //   etapa de disposición (`disposicionCreditoFecha` →
  //   `hs_v2_date_entered_*`). Esas propiedades son calculadas y rechazan
  //   escrituras; como todas las de una confirmación viajan en una sola
  //   llamada, intentarlo tumbaría también al estado.
  // - El **monto de la compra** ya vive en `cotizacionMontoTotalCompra`,
  //   que captura la tienda con la cotización. Escribir encima el monto
  //   dispuesto lo corrompería: no son el mismo número — la cotización
  //   puede ser mayor que el crédito.
  //
  // El monto realmente dispuesto se guarda en el vale (Firestore) y se ve
  // en `/admin/vales`. Si algún día hace falta en el CRM, va en una
  // propiedad nueva y dedicada, nunca encima de una que ya significa otra
  // cosa.
  valeCodigo: "codigo_paydesk",
  valeUrl: "link_codigo_paydesk",
  valeEstado: "codigo_paydesk_estatus",

  // --- Notificación (section 9) ---
  // Written onto the triggering deal the first time a given store is seen,
  // so a second HubSpot workflow can enroll on "property is known" and
  // send that store's contact the Paydesk link. Access itself is granted
  // separately, per person, from the admin catalog — see
  // concesionario/userSync.ts. TODO: confirm the trigger mechanism and the
  // recipient contact with the HubSpot workflow owner.
  paydeskUrl: "TODO_paydesk_url",
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
 * file URL fields, and the notification field (paydeskUrl)
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
 * Las etapas que significan "este crédito ya no existe": Precancelación y
 * Cancelado en el pipeline actual (`1341580191`, `1341580192`), más la
 * etapa equivalente del pipeline viejo (`33823869`), donde todavía viven
 * deals históricos. Un `dealstage` solo puede coincidir con un id de su
 * propio pipeline, así que mezclar ambos en una lista es inofensivo.
 *
 * Precancelación entra a propósito, aunque sea un paso previo a la
 * cancelación definitiva: los costos no son simétricos. Matar un vale de
 * más se arregla reemitiéndolo desde `/admin/vales`; dejarlo vivo de más
 * significa que la tienda entrega material contra un crédito que Aviva ya
 * está retirando, y eso no se deshace. Si en la práctica resulta muy
 * agresivo, se quita desde `/admin/etapas-cancelacion` sin desplegar.
 *
 * Estos son los **valores por defecto**: la lista en uso vive en Firestore
 * y se edita desde el panel — ver firestore/cancelStagesRepository.ts.
 * También son las etapas que el backfill inicial se salta por completo.
 */
export const HUBSPOT_EXCLUDED_STAGES = [
  "1341580191",
  "1341580192",
  "33823869",
] as const;

/** The five milestone dates that can be reached through more than one HubSpot property — see STAGE_DATE_EXTRA_PROPERTIES_DEFAULT below. */
export const STAGE_DATE_KEYS = [
  "fechaSolicitud",
  "estatusKyc",
  "creditoLiberadoFecha",
  "disposicionCreditoFecha",
  "desembolsoFecha",
] as const;

export type StageDateKey = (typeof STAGE_DATE_KEYS)[number];

/**
 * Extra HubSpot properties to check for each of the five milestone dates,
 * beyond the field dictionary's own property for that field — in priority
 * order, first non-empty wins (see hubspot/deals.ts's `stageDate()`). A
 * stage can be reachable through more than one path in HubSpot — the
 * original case was a deal sitting in the obsolete `legacy` pipeline,
 * where each of these five milestones' dates lives under a different
 * `hs_v2_date_entered_<stageId>` system property than the `current`
 * pipeline's (the two pipelines don't share stage ids) — but nothing
 * limits it to exactly one extra property or to pipeline differences
 * specifically.
 *
 * These are the *defaults*; the list in effect lives in Firestore and is
 * editable from /admin/etapas-fecha (see
 * firestore/stageDatePropertiesRepository.ts), same pattern as the field
 * dictionary.
 */
export const STAGE_DATE_EXTRA_PROPERTIES_DEFAULT: Record<StageDateKey, string[]> = {
  fechaSolicitud: ["hs_v2_date_entered_36073275"],
  estatusKyc: ["hs_v2_date_entered_183822132"],
  creditoLiberadoFecha: ["hs_v2_date_entered_33642516"],
  disposicionCreditoFecha: ["hs_v2_date_entered_171655337"],
  desembolsoFecha: ["hs_v2_date_entered_33823866"],
};


/**
 * Los valores que acepta `codigo_paydesk_estatus`, el desplegable de
 * HubSpot. Tienen que coincidir **exactamente** con los valores internos de
 * sus opciones: HubSpot rechaza cualquier otra cosa, y como las propiedades
 * de una confirmación viajan en una sola llamada, un valor inválido tumba
 * la escritura completa.
 *
 * Van aquí y no sueltos en el código para que el día que alguien renombre
 * una opción en HubSpot haya un solo lugar que tocar.
 *
 * El desplegable tiene además una opción "Error" que Paydesk nunca escribe:
 * queda reservada para marcar a mano un caso que se atore.
 */
export const VALE_ESTADO_HUBSPOT = {
  emitido: "Emitido",
  utilizado: "Utilizado",
} as const;

/**
 * Vigencia por defecto de un vale, en horas. El valor en uso vive en
 * Firestore y se edita desde `/admin/vales` — ver
 * firestore/valeConfigRepository.ts.
 */
export const VALE_VIGENCIA_HORAS_DEFAULT = 72;
