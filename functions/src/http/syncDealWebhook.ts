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

    const deal = await fetchDealById(dealId);
    if (!deal) {
      logger.warn(`syncDealWebhook: deal ${dealId} not found in HubSpot`);
      res.status(404).send("Deal not found");
      return;
    }

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
      const url = `${env.payDeskBaseUrl}/c/${encodeURIComponent(deal.concesionarioId)}`;
      await updateDealProperties(dealId, { paydeskUrl: url });
      logger.info(
        `syncDealWebhook: created paydesk page for concesionario ${deal.concesionarioId}`,
      );
    }

    res.status(200).json({ ok: true, isNewConcesionario });
  },
);
