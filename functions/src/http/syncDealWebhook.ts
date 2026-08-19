import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { env } from "../config/env";
import { fetchDealById } from "../hubspot/deals";
import { fetchCompanyName, updateCompanyProperties } from "../hubspot/companies";
import { upsertDealFromHubspot } from "../firestore/dealsRepository";

interface SyncWebhookBody {
  dealId?: string;
}

/**
 * HTTPS endpoint called by the HubSpot workflow's Custom Code action
 * (section 9) whenever a deal in the Solicitudes pipeline is created or
 * changes stage/relevant properties. Pulls the current deal state from
 * HubSpot (including its associated company, the concesionario) and
 * upserts it into Firestore.
 *
 * The first time a given concesionario gets a Firestore doc, also writes
 * the Pay Desk URL back onto their HubSpot company so a second HubSpot
 * workflow can pick it up and notify the concesionario's contact (section
 * 9, "Notificación"). Later deals for the same concesionario just add a
 * row to their existing page — no repeat notification.
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
      // No company associated yet — nothing to group this deal under. The
      // workflow will re-trigger on the next relevant property change, by
      // which point the association should exist.
      logger.warn(
        `syncDealWebhook: deal ${dealId} has no associated company, skipping`,
      );
      res.status(200).json({ ok: true, skipped: "no-concesionario" });
      return;
    }

    const concesionarioNombre = await fetchCompanyName(deal.concesionarioId);
    const { isNewConcesionario } = await upsertDealFromHubspot(
      deal,
      concesionarioNombre,
    );

    if (isNewConcesionario) {
      const url = `${env.payDeskBaseUrl}/c/${deal.concesionarioId}`;
      await updateCompanyProperties(deal.concesionarioId, { paydeskUrl: url });
      logger.info(
        `syncDealWebhook: created paydesk page for concesionario ${deal.concesionarioId}`,
      );
    }

    res.status(200).json({ ok: true, isNewConcesionario });
  },
);
