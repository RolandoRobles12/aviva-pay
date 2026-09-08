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
  /** Shared secret the HubSpot workflow's "Send a webhook" action sends verbatim (no "Bearer " prefix) so the webhook can verify the caller. */
  get hubspotWebhookSecret(): string {
    return required("HUBSPOT_WEBHOOK_SECRET");
  },
  /**
   * La base de las ligas que Paydesk escribe en HubSpot: la del portal de
   * la tienda y la del vale del cliente.
   *
   * El default apuntaba a `pay.avivacredito.com`, un dominio que todavía no
   * existe. Eso no fallaba en el momento — fallaba después, y en silencio:
   * la liga se escribía en el deal, el workflow se la mandaba al cliente
   * por WhatsApp, y el cliente abría un DNS_PROBE_FINISHED_NXDOMAIN. Una
   * liga muerta escrita en HubSpot no se arregla sola: se queda ahí.
   *
   * Ahora el default es la URL que Firebase Hosting da sola al proyecto,
   * que siempre resuelve. `PAYDESK_BASE_URL` la sobrescribe el día que el
   * dominio propio exista.
   */
  get payDeskBaseUrl(): string {
    const configurada = process.env.PAYDESK_BASE_URL?.trim();
    if (configurada) return configurada.replace(/\/+$/, "");

    // GCLOUD_PROJECT lo pone el runtime de Cloud Functions; FIREBASE_CONFIG
    // es el respaldo para el emulador y para entornos que no lo traen.
    const projectId =
      process.env.GCLOUD_PROJECT ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      (() => {
        try {
          return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId;
        } catch {
          return undefined;
        }
      })();

    if (!projectId) {
      throw new Error(
        "No se pudo determinar la URL base de Paydesk: define PAYDESK_BASE_URL.",
      );
    }
    return `https://${projectId}.web.app`;
  },
};
