/**
 * Centralized access to runtime configuration. Uses process.env, populated
 * either by Cloud Functions params (firebase functions:secrets / .env files
 * used by the Firebase CLI) or by the emulator's functions/.env.local.
 *
 * See functions/.env.example for the full list of required variables.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get hubspotPrivateAppToken(): string {
    return required("HUBSPOT_PRIVATE_APP_TOKEN");
  },
  /** Shared secret the HubSpot workflow's Custom Code action sends so the webhook can verify the caller. */
  get hubspotWebhookSecret(): string {
    return required("HUBSPOT_WEBHOOK_SECRET");
  },
  get payDeskBaseUrl(): string {
    return process.env.PAYDESK_BASE_URL ?? "https://pay.avivacredito.com";
  },
  /**
   * Secret salt used to derive each concesionario's opaque page id from its
   * Kiosco value (see concesionario/identity.ts). Must stay secret — anyone
   * holding it can compute every store's URL from the public HubSpot option
   * list. Rotating it invalidates every existing Pay Desk link.
   */
  get payDeskIdSalt(): string {
    return required("PAYDESK_ID_SALT");
  },
};
