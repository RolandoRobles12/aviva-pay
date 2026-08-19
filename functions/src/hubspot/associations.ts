import { getHubspotClient } from "./client";

/**
 * Resolves the HubSpot company (concesionario) associated with a deal.
 * Aviva Pay Desk assumes a deal has exactly one relevant company
 * association; if a deal ever has more than one, this takes the first
 * result returned by the API. TODO: confirm with the HubSpot admin whether
 * a "primary" association label should be used instead once multiple
 * associated companies become possible.
 */
export async function getConcesionarioIdForDeal(
  dealId: string,
): Promise<string | null> {
  const hubspot = getHubspotClient();
  const result = await hubspot.crm.associations.v4.basicApi.getPage(
    "deals",
    dealId,
    "companies",
  );
  return result.results[0]?.toObjectId ?? null;
}
