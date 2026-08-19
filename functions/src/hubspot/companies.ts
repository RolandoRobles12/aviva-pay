import { getHubspotClient } from "./client";
import {
  HUBSPOT_COMPANY_PROPERTIES,
  HUBSPOT_COMPANY_PROPERTY_LIST,
} from "../config/fields";

export async function fetchCompanyName(
  concesionarioId: string,
): Promise<string | null> {
  const hubspot = getHubspotClient();
  const response = await hubspot.crm.companies.basicApi.getById(
    concesionarioId,
    HUBSPOT_COMPANY_PROPERTY_LIST,
  );
  return response.properties[HUBSPOT_COMPANY_PROPERTIES.nombre] ?? null;
}

export async function updateCompanyProperties(
  concesionarioId: string,
  values: Partial<Record<keyof typeof HUBSPOT_COMPANY_PROPERTIES, string>>,
): Promise<void> {
  const hubspot = getHubspotClient();
  const properties: Record<string, string> = {};

  for (const [logicalKey, value] of Object.entries(values)) {
    const hubspotProperty =
      HUBSPOT_COMPANY_PROPERTIES[
        logicalKey as keyof typeof HUBSPOT_COMPANY_PROPERTIES
      ];
    if (hubspotProperty && value !== undefined) {
      properties[hubspotProperty] = value;
    }
  }

  if (Object.keys(properties).length === 0) return;

  await hubspot.crm.companies.basicApi.update(concesionarioId, { properties });
}
