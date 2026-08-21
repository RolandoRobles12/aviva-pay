import { Client } from "@hubspot/api-client";
import { env } from "../config/env";

let client: Client | undefined;

/**
 * Lazily-constructed HubSpot API client, authenticated with the private app
 * token dedicated to Aviva Paydesk (section 6 — never reuse the general
 * Ro_Bot token used by the existing batch scripts).
 */
export function getHubspotClient(): Client {
  if (!client) {
    client = new Client({ accessToken: env.hubspotPrivateAppToken });
  }
  return client;
}
