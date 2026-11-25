import { logger } from "firebase-functions/v2";
import { env } from "../config/env";

/**
 * La liga a un deal dentro de HubSpot, para los avisos de Slack que llevan
 * a la solicitud (el deal es la solicitud; HubSpot es la fuente de verdad).
 *
 * HubSpot arma la URL con el ID del portal y con el dominio de su región
 * (`app.hubspot.com`, `app-eu1.hubspot.com`, …). Los dos se le preguntan a
 * la API con el mismo token de la app privada, una vez por instancia, para
 * que no haya que configurar nada. `HUBSPOT_PORTAL_ID` los fija a mano si
 * hiciera falta (con el dominio de EE. UU., o `HUBSPOT_UI_DOMAIN`).
 */
interface Cuenta {
  portalId: string;
  uiDomain: string;
}

let cuenta: Promise<Cuenta> | null = null;

async function pedirCuenta(): Promise<Cuenta> {
  const fijo = process.env.HUBSPOT_PORTAL_ID?.trim();
  if (fijo) {
    return { portalId: fijo, uiDomain: process.env.HUBSPOT_UI_DOMAIN?.trim() || "app.hubspot.com" };
  }
  const res = await fetch("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${env.hubspotPrivateAppToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`account-info respondió ${res.status}`);
  const data = (await res.json()) as { portalId?: number; uiDomain?: string };
  if (!data.portalId) throw new Error("account-info no trajo portalId");
  return { portalId: String(data.portalId), uiDomain: data.uiDomain || "app.hubspot.com" };
}

export function construirUrlDeal(c: Cuenta, dealId: string): string {
  // 0-3 es el tipo de objeto "deal" en las URLs de registros de HubSpot.
  return `https://${c.uiDomain}/contacts/${encodeURIComponent(c.portalId)}/record/0-3/${encodeURIComponent(dealId)}`;
}

/**
 * La URL del deal en HubSpot, o `null` si no se pudo saber el portal: el
 * aviso sale igual, sin el botón. Un fallo no se recuerda, para que el
 * siguiente aviso lo vuelva a intentar.
 */
export async function urlDealHubspot(dealId: string): Promise<string | null> {
  try {
    cuenta ??= pedirCuenta();
    return construirUrlDeal(await cuenta, dealId);
  } catch (err) {
    cuenta = null;
    logger.error("urlDealHubspot: no se pudo obtener el portal de HubSpot", err);
    return null;
  }
}
