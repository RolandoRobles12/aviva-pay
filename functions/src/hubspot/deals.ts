import { getHubspotClient } from "./client";
import {
  HUBSPOT_DEAL_PROPERTIES,
  HUBSPOT_DEAL_PROPERTY_LIST,
} from "../config/fields";
import type { PayDeskDeal, UploadStatus } from "../types/deal";

type RawProperties = Record<string, string | null | undefined>;

function toNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
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
 * Pay Desk needs (section 7). Returns null if the deal doesn't exist.
 */
export async function fetchDealById(
  dealId: string,
): Promise<Omit<PayDeskDeal, "actualizadoEn" | "creadoEn"> | null> {
  const hubspot = getHubspotClient();

  let response;
  try {
    response = await hubspot.crm.deals.basicApi.getById(
      dealId,
      HUBSPOT_DEAL_PROPERTY_LIST,
    );
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 404) return null;
    throw err;
  }

  const props = response.properties as RawProperties;
  const p = HUBSPOT_DEAL_PROPERTIES;

  return {
    dealId,
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
}

/**
 * Writes a partial set of logical fields back to the HubSpot deal (section
 * 3.1 "Escritura de vuelta hacia HubSpot", section 9). Callers pass logical
 * keys from HUBSPOT_DEAL_PROPERTIES; this translates them to real property
 * names before calling the API.
 */
export async function updateDealProperties(
  dealId: string,
  values: Partial<Record<keyof typeof HUBSPOT_DEAL_PROPERTIES, string>>,
): Promise<void> {
  const hubspot = getHubspotClient();
  const properties: Record<string, string> = {};

  for (const [logicalKey, value] of Object.entries(values)) {
    const hubspotProperty =
      HUBSPOT_DEAL_PROPERTIES[logicalKey as keyof typeof HUBSPOT_DEAL_PROPERTIES];
    if (hubspotProperty && value !== undefined) {
      properties[hubspotProperty] = value;
    }
  }

  if (Object.keys(properties).length === 0) return;

  await hubspot.crm.deals.basicApi.update(dealId, { properties });
}
