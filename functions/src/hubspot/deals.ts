import { logger } from "firebase-functions/v2";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/deals/models/Filter";
import { getHubspotClient } from "./client";
import type { HubspotDealPropertyKey, StageDateKey } from "../config/fields";
import {
  HUBSPOT_EXCLUDED_STAGES,
  HUBSPOT_PIPELINES,
  HUBSPOT_PRODUCT_FILTER,
} from "../config/fields";
import { getFieldDictionary } from "../firestore/fieldDictionaryRepository";
import {
  getStageDateProperties,
  type StageDateProperties,
} from "../firestore/stageDatePropertiesRepository";
import {
  deriveConcesionarioId,
  parseKioscoValue,
} from "../concesionario/identity";
import type { PayDeskDeal, UploadStatus } from "../types/deal";

type RawProperties = Record<string, string | null | undefined>;

/** First value that isn't null/undefined/empty, in order. Used to prefer the current pipeline's stage-date property over the legacy pipeline's. */
function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null | undefined {
  return values.find((v) => v !== null && v !== undefined && v !== "");
}

function toNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

/**
 * HubSpot returns "date" properties as epoch-millis strings (e.g.
 * "1699999999000") but "datetime" properties as ISO-8601 strings — which
 * one depends on how the property is configured in HubSpot, not on
 * anything this app controls. `new Date("1699999999000")` is Invalid Date
 * (the string form isn't treated as a timestamp), so a purely-numeric raw
 * value is parsed as millis explicitly instead of handed to `new Date()`
 * as-is.
 */
function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toBoolean(raw: string | null | undefined): boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return raw === "true" || raw === "Yes" || raw === "1";
}

/**
 * Write-side counterpart to `toIsoDate`, for HubSpot "date" properties
 * (cotizacionFechaEntregaAcordada, comprobanteFechaEntrega): these expect
 * midnight UTC of that calendar day as an epoch-millis string, not an
 * arbitrary date string — confirmed against the real portal. `raw` comes
 * from an `<input type="date">`, i.e. already a plain "YYYY-MM-DD".
 */
export function toHubspotDateProperty(raw: string): string {
  return String(Date.parse(`${raw}T00:00:00.000Z`));
}

/**
 * `cotizacionEstatus` and `comprobanteEntregaEstatus` are HubSpot "single
 * checkbox" properties (confirmed against the real portal) — their
 * internal option values are the literal strings "true" / "false", not
 * "completado" / "pendiente". Paydesk's own vocabulary is
 * "completado"/"pendiente"; this is the read-side half of that
 * translation (see uploadCotizacion.ts / uploadComprobante.ts for the
 * write-side half).
 */
function toUploadStatus(raw: string | null | undefined): UploadStatus {
  return raw === "true" ? "completado" : "pendiente";
}

/** Every property this app might need from a deal: the field dictionary's values, the extra stage-date properties, and "pipeline" itself. Shared so a single HubSpot request (getById or search) can fetch everything at once. */
async function allDealProperties(): Promise<{
  dictionary: Awaited<ReturnType<typeof getFieldDictionary>>;
  stageDateExtras: StageDateProperties;
  properties: string[];
}> {
  const [dictionary, stageDateExtras] = await Promise.all([
    getFieldDictionary(),
    getStageDateProperties(),
  ]);
  return {
    dictionary,
    stageDateExtras,
    properties: [
      ...Object.values(dictionary),
      ...Object.values(stageDateExtras).flat(),
      "pipeline",
    ],
  };
}

/**
 * Maps a deal's raw HubSpot properties into the subset of fields Aviva
 * Paydesk needs (section 7), plus which pipeline it's in. Shared by
 * `fetchDealById` (one deal via getById) and the bulk backfill (many deals
 * via search, which returns properties directly — no per-deal getById
 * needed).
 *
 * The pipeline comes along because this portal isn't exclusive to
 * Construrama — other Aviva products' deals live in the same HubSpot
 * account. Callers that care (the backfill) compare `pipelineId`
 * themselves rather than this function silently filtering, since a
 * general-purpose mapper shouldn't bake in that policy. The ongoing
 * webhook doesn't check it at all — it only ever gets called for deals the
 * HubSpot Workflow itself already scoped to this product.
 *
 * The five pipeline-stage dates (fechaSolicitud, estatusKyc,
 * creditoLiberadoFecha, disposicionCreditoFecha, desembolsoFecha) prefer
 * the current pipeline's property and fall back, in order, to whichever
 * extra properties are configured for that field — see
 * STAGE_DATE_EXTRA_PROPERTIES_DEFAULT / stageDateExtras. The original case
 * was a deal only ever having the current pipeline's *or* the legacy
 * pipeline's property populated, never both, but nothing here assumes
 * that's still the only case — the first non-empty property wins,
 * whatever the reason two ended up set.
 */
function mapDealProperties(
  dealId: string,
  props: RawProperties,
  p: Awaited<ReturnType<typeof getFieldDictionary>>,
  stageDateExtras: StageDateProperties,
): {
  deal: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">;
  pipelineId: string | null;
} {
  const kiosco = parseKioscoValue(props[p.kiosco]);
  if (kiosco.all.length > 1) {
    logger.warn(
      `mapDealProperties: deal ${dealId} has ${kiosco.all.length} Kioscos selected ` +
        `(${kiosco.all.join(", ")}); using the first one`,
    );
  }

  const stageDate = (key: StageDateKey) => {
    const extras = stageDateExtras[key] ?? [];
    return toIsoDate(
      firstNonEmpty(props[p[key]], ...extras.map((prop) => props[prop])),
    );
  };

  const deal = {
    dealId,
    concesionarioId: kiosco.primary
      ? deriveConcesionarioId(kiosco.primary)
      : null,
    kiosco: kiosco.primary,
    cliente: props[p.cliente] ?? null,
    fechaSolicitud: stageDate("fechaSolicitud"),
    montoAprobado: toNumber(props[p.montoAprobado]),
    // A HubSpot stage-entry date ("hs_v2_date_entered_<stageId>"), not a
    // status label — same treatment as the other pipeline-stage dates.
    estatusKyc: stageDate("estatusKyc"),

    cotizacionEstatus: toUploadStatus(props[p.cotizacionEstatus]),
    cotizacionUrl: props[p.cotizacionUrl] ?? null,
    cotizacionFechaEntregaAcordada: toIsoDate(
      props[p.cotizacionFechaEntregaAcordada],
    ),
    cotizacionMontoTotalCompra: toNumber(props[p.cotizacionMontoTotalCompra]),

    creditoLiberadoFecha: stageDate("creditoLiberadoFecha"),
    disposicionCreditoFecha: stageDate("disposicionCreditoFecha"),

    comprobanteEntregaEstatus: toUploadStatus(
      props[p.comprobanteEntregaEstatus],
    ),
    comprobanteUrl: props[p.comprobanteUrl] ?? null,
    comprobanteFechaEntrega: toIsoDate(props[p.comprobanteFechaEntrega]),
    comprobanteFirmaClienteConfirmada: toBoolean(
      props[p.comprobanteFirmaClienteConfirmada],
    ),

    desembolsoFecha: stageDate("desembolsoFecha"),
  };

  return { deal, pipelineId: props["pipeline"] ?? null };
}

/**
 * Fetches a single deal from HubSpot and maps it (see mapDealProperties).
 * Returns null if the deal doesn't exist.
 */
export async function fetchDealById(dealId: string): Promise<{
  deal: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">;
  pipelineId: string | null;
} | null> {
  const hubspot = getHubspotClient();
  const { dictionary: p, stageDateExtras, properties } = await allDealProperties();

  let response;
  try {
    response = await hubspot.crm.deals.basicApi.getById(dealId, properties);
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 404) return null;
    throw err;
  }

  return mapDealProperties(
    dealId,
    response.properties as RawProperties,
    p,
    stageDateExtras,
  );
}

const SEARCH_PAGE_SIZE = 100;

/**
 * Every Construrama deal that has actually reached the "Aprobado" stage,
 * across both pipelines (current + legacy), mapped and ready to upsert —
 * for the admin-triggered backfill (adminSyncConstrurama). Nothing else
 * calls this; ongoing syncing is the per-deal webhook.
 *
 * Base filters mirror the team's original reporting script: `aos_product`
 * = "Construrama HomeLoan", `pipeline` IN [current, legacy], `dealstage`
 * NOT_IN [canceled stages]. On top of that, `fechaSolicitud`'s HubSpot
 * property is deliberately mapped to the "entered Aprobado" stage-date
 * (not literally "when the deal was created") specifically so its
 * presence marks a deal as approved — a deal that was only ever rejected
 * never gets that property set. So this requires it via HAS_PROPERTY,
 * checked against whichever equivalent property the deal would actually
 * carry (current pipeline's `p.fechaSolicitud`, or any of the configured
 * extras in stageDateExtras.fechaSolicitud — see
 * STAGE_DATE_EXTRA_PROPERTIES_DEFAULT) — one filter group per property,
 * since HubSpot filter groups are OR'd together while filters within a
 * group are AND'd. A rejected deal has none of them, so it matches no
 * group and is excluded.
 *
 * Properties come back directly in the search results, so this doesn't do
 * a getById per deal.
 */
export async function searchConstruramaDeals(): Promise<
  Array<{
    deal: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">;
    pipelineId: string | null;
  }>
> {
  const hubspot = getHubspotClient();
  const { dictionary: p, stageDateExtras, properties } = await allDealProperties();

  const baseFilters = [
    {
      propertyName: HUBSPOT_PRODUCT_FILTER.property,
      operator: FilterOperatorEnum.Eq,
      value: HUBSPOT_PRODUCT_FILTER.value,
    },
    {
      propertyName: "pipeline",
      operator: FilterOperatorEnum.In,
      values: [HUBSPOT_PIPELINES.current, HUBSPOT_PIPELINES.legacy],
    },
    {
      propertyName: "dealstage",
      operator: FilterOperatorEnum.NotIn,
      values: [...HUBSPOT_EXCLUDED_STAGES],
    },
  ];

  const approvedDateProperties = [
    p.fechaSolicitud,
    ...(stageDateExtras.fechaSolicitud ?? []),
  ].filter((prop): prop is string => Boolean(prop));

  const filterGroups = approvedDateProperties.map((propertyName) => ({
    filters: [
      ...baseFilters,
      { propertyName, operator: FilterOperatorEnum.HasProperty },
    ],
  }));

  const results: Array<{
    deal: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">;
    pipelineId: string | null;
  }> = [];

  let after = "";
  let page = 0;
  do {
    const response = await hubspot.crm.deals.searchApi.doSearch({
      filterGroups,
      properties,
      limit: SEARCH_PAGE_SIZE,
      after,
      sorts: [],
      query: "",
    });

    for (const result of response.results) {
      results.push(
        mapDealProperties(
          result.id,
          result.properties as RawProperties,
          p,
          stageDateExtras,
        ),
      );
    }

    after = response.paging?.next?.after ?? "";
    page += 1;
    logger.info(
      `searchConstruramaDeals: page ${page}, ${response.results.length} deals ` +
        `(${results.length} total so far)`,
    );
  } while (after);

  return results;
}

/**
 * Writes a partial set of logical fields back to the HubSpot deal (section
 * 3.1 "Escritura de vuelta hacia HubSpot", section 9). Callers pass logical
 * field names; this translates them to real HubSpot property names via the
 * field dictionary before calling the API.
 */
export async function updateDealProperties(
  dealId: string,
  values: Partial<Record<HubspotDealPropertyKey, string>>,
): Promise<void> {
  const hubspot = getHubspotClient();
  const dictionary = await getFieldDictionary();
  const properties: Record<string, string> = {};

  for (const [logicalKey, value] of Object.entries(values)) {
    const hubspotProperty = dictionary[logicalKey as HubspotDealPropertyKey];
    if (!hubspotProperty || value === undefined) continue;
    if (hubspotProperty.startsWith("TODO_")) {
      // Unmapped field (or one left as TODO_ on purpose, like paydeskUrl/
      // paydeskCodigo pending a different process) — HubSpot has no
      // property with this literal name, so writing it would 400 and
      // fail the whole update, including the properties that ARE mapped.
      logger.warn(
        `updateDealProperties: skipping "${logicalKey}" for deal ${dealId} — ` +
          `still unmapped in the field dictionary (${hubspotProperty})`,
      );
      continue;
    }
    properties[hubspotProperty] = value;
  }

  if (Object.keys(properties).length === 0) return;

  await hubspot.crm.deals.basicApi.update(dealId, { properties });
}
