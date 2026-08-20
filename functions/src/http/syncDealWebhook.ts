import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { env } from "../config/env";
import { HUBSPOT_PIPELINE } from "../config/fields";
import { fetchDealById, updateDealProperties } from "../hubspot/deals";
import { upsertDealFromHubspot } from "../firestore/dealsRepository";
import { getConcesionario } from "../firestore/concesionariosRepository";

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
    const { deal, pipelineId } = result;

    // This HubSpot portal isn't exclusive to Construrama — other Aviva
    // products' deals live here too. The workflow that calls this webhook
    // should already be scoped to the Solicitudes pipeline, but that's
    // configured in HubSpot, outside this codebase, so this check is a
    // second line of defense in case that scoping is ever loosened or the
    // webhook gets called by hand for the wrong deal.
    if (pipelineId !== HUBSPOT_PIPELINE.pipelineId) {
      logger.warn(
        `syncDealWebhook: deal ${dealId} is on pipeline "${pipelineId}", not the ` +
          `Construrama Solicitudes pipeline ("${HUBSPOT_PIPELINE.pipelineId}") — skipping`,
      );
      res.status(200).json({ ok: true, skipped: "wrong-pipeline" });
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
      // First time we see this store: hand HubSpot the login URL and the
      // store's código so the notification workflow can pass them on. The
      // NIP is generated in the admin panel and delivered separately — it
      // never touches HubSpot.
      const concesionario = await getConcesionario(deal.concesionarioId);
      await updateDealProperties(dealId, {
        paydeskUrl: env.payDeskBaseUrl,
        ...(concesionario?.codigo ? { paydeskCodigo: concesionario.codigo } : {}),
      });
      logger.info(
        `syncDealWebhook: registered concesionario ${deal.concesionarioId}`,
      );
    }

    res.status(200).json({ ok: true, isNewConcesionario });
  },
);
