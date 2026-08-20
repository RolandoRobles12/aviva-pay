import { logger } from "firebase-functions/v2";
import { getHubspotClient } from "./client";
import type { HubspotDealPropertyKey } from "../config/fields";
import { getFieldDictionary } from "../firestore/fieldDictionaryRepository";
import {
  deriveConcesionarioId,
  parseKioscoValue,
} from "../concesionario/identity";
import type { PayDeskDeal, UploadStatus } from "../types/deal";

type RawProperties = Record<string, string | null | undefined>;

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

function toUploadStatus(raw: string | null | undefined): UploadStatus {
  return raw === "completado" ? "completado" : "pendiente";
}

/**
 * Fetches a deal from HubSpot and maps it into the subset of fields Aviva
 * Pay Desk needs (section 7), plus which pipeline it's in. Returns null if
 * the deal doesn't exist.
 *
 * The pipeline comes along because this portal isn't exclusive to
 * Construrama — other Aviva products' deals live in the same HubSpot
 * account. Callers that only care about the Construrama Solicitudes
 * pipeline (syncDealWebhook) compare `pipelineId` against
 * `HUBSPOT_PIPELINE.pipelineId` themselves rather than this function
 * silently filtering, since a general-purpose deal fetch shouldn't bake in
 * that policy.
 */
export async function fetchDealById(dealId: string): Promise<{
  deal: Omit<PayDeskDeal, "actualizadoEn" | "creadoEn">;
  pipelineId: string | null;
} | null> {
  const hubspot = getHubspotClient();
  const p = await getFieldDictionary();

  let response;
  try {
    response = await hubspot.crm.deals.basicApi.getById(dealId, [
      ...Object.values(p),
      "pipeline",
    ]);
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 404) return null;
    throw err;
  }

  const props = response.properties as RawProperties;

  const kiosco = parseKioscoValue(props[p.kiosco]);
  if (kiosco.all.length > 1) {
    logger.warn(
      `fetchDealById: deal ${dealId} has ${kiosco.all.length} Kioscos selected ` +
        `(${kiosco.all.join(", ")}); using the first one`,
    );
  }

  const deal = {
    dealId,
    concesionarioId: kiosco.primary
      ? deriveConcesionarioId(kiosco.primary)
      : null,
    kiosco: kiosco.primary,
    cliente: props[p.cliente] ?? null,
    fechaSolicitud: toIsoDate(props[p.fechaSolicitud]),
    montoAprobado: toNumber(props[p.montoAprobado]),
    estatusKyc: props[p.estatusKyc] ?? null,

    cotizacionEstatus: toUploadStatus(props[p.cotizacionEstatus]),
    cotizacionUrl: props[p.cotizacionUrl] ?? null,
    cotizacionFechaEntregaAcordada: toIsoDate(
      props[p.cotizacionFechaEntregaAcordada],
    ),
    cotizacionMontoTotalCompra: toNumber(props[p.cotizacionMontoTotalCompra]),

    creditoLiberadoFecha: toIsoDate(props[p.creditoLiberadoFecha]),
    disposicionCreditoFecha: toIsoDate(props[p.disposicionCreditoFecha]),

    comprobanteEntregaEstatus: toUploadStatus(
      props[p.comprobanteEntregaEstatus],
    ),
    comprobanteUrl: props[p.comprobanteUrl] ?? null,
    comprobanteFechaEntrega: toIsoDate(props[p.comprobanteFechaEntrega]),
    comprobanteFirmaClienteConfirmada: toBoolean(
      props[p.comprobanteFirmaClienteConfirmada],
    ),

    desembolsoFecha: toIsoDate(props[p.desembolsoFecha]),
  };

  return { deal, pipelineId: props["pipeline"] ?? null };
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
    if (hubspotProperty && value !== undefined) {
      properties[hubspotProperty] = value;
    }
  }

  if (Object.keys(properties).length === 0) return;

  await hubspot.crm.deals.basicApi.update(dealId, { properties });
}
