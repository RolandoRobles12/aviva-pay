import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { env } from "../config/env";
import { fetchDealById, updateDealProperties } from "../hubspot/deals";
import { upsertDealFromHubspot } from "../firestore/dealsRepository";

interface SyncWebhookBody {
  dealId?: string;
}

/**
 * HTTPS endpoint called by the HubSpot workflow's Custom Code action
 * (section 9) whenever a deal in the Solicitudes pipeline is created or
 * changes stage/relevant properties. Pulls the current deal state from
 * HubSpot and upserts it into Firestore, grouped by the concesionario
 * (Construrama store) named on the deal itself.
 *
 * The first time a given concesionario is seen, also writes the Pay Desk
 * URL back onto the triggering deal so a second HubSpot workflow can pick
 * it up and notify that store's contact (section 9, "Notificación").
 * Later deals for the same concesionario just add a row to the existing
 * page — no repeat notification.
 */
export const syncDealWebhook = onRequest(
  { cors: false, region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const authHeader = req.get("Authorization") ?? "";
    const expected = `Bearer ${env.hubspotWebhookSecret}`;
    if (authHeader !== expected) {
      logger.warn("syncDealWebhook: rejected request with invalid auth header");
      res.status(401).send("Unauthorized");
      return;
    }

    const { dealId } = req.body as SyncWebhookBody;
    if (!dealId || typeof dealId !== "string") {
      res.status(400).send("Missing dealId");
      return;
    }

    const result = await fetchDealById(dealId);
    if (!result) {
      logger.warn(`syncDealWebhook: deal ${dealId} not found in HubSpot`);
      res.status(404).send("Deal not found");
      return;
    }
    const { deal } = result;

    // No product/pipeline check here on purpose: this portal isn't
    // exclusive to Construrama, but this endpoint is only ever called by
    // the HubSpot Workflow that's already scoped to this product — unlike
    // the admin-triggered backfill (adminSyncConstrurama), which scans the
    // whole portal and has to filter for itself.
    if (!deal.concesionarioId) {
      // The deal doesn't name a concesionario yet — nothing to group it
      // under. The workflow re-triggers on the next relevant property
      // change, by which point the field should be filled in.
      logger.warn(
        `syncDealWebhook: deal ${dealId} has no concesionario set, skipping`,
      );
      res.status(200).json({ ok: true, skipped: "no-concesionario" });
      return;
    }

    const { isNewConcesionario } = await upsertDealFromHubspot(deal);

    if (isNewConcesionario) {
      // First time we see this store: hand HubSpot the login URL so the
      // notification workflow can pass it on. There's no store-wide
      // código anymore — access is per person (invited email + password,
      // see concesionario/userSync.ts), granted from the admin catalog,
      // never through HubSpot.
      await updateDealProperties(dealId, { paydeskUrl: env.payDeskBaseUrl });
      logger.info(
        `syncDealWebhook: registered concesionario ${deal.concesionarioId}`,
      );
    }

    res.status(200).json({ ok: true, isNewConcesionario });
  },
);
