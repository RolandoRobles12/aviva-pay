import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import { searchConstruramaDeals } from "../../hubspot/deals";
import { upsertDealFromHubspot } from "../../firestore/dealsRepository";

/** How many deals to upsert into Firestore concurrently. Keeps the backfill fast without opening hundreds of writes at once. */
const CONCURRENCY = 10;

/**
 * One-time (or occasional) bulk backfill: pulls every Construrama deal
 * from HubSpot — across both the current and the obsolete "legacy"
 * pipeline — and upserts each into Firestore, same as the per-deal webhook
 * does for new activity going forward.
 *
 * Deliberately does NOT trigger the "notify the store" write-back
 * (paydeskUrl/paydeskCodigo) that syncDealWebhook does for a brand-new
 * concesionario — firing that for every store discovered in one bulk pass
 * would notify all of them at once, which needs to be a deliberate,
 * separate rollout (see docs/ARCHITECTURE.md — "Pendientes conocidos").
 */
export const adminSyncConstrurama = onCall(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    const admin = assertAdmin(request);
    logger.info(`adminSyncConstrurama: started by ${admin.email ?? admin.uid}`);

    const found = await searchConstruramaDeals();

    let synced = 0;
    let skippedNoConcesionario = 0;
    let newStores = 0;
    let failed = 0;

    for (let i = 0; i < found.length; i += CONCURRENCY) {
      const batch = found.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.allSettled(
        batch.map(async ({ deal }) => {
          if (!deal.concesionarioId) {
            skippedNoConcesionario++;
            return;
          }
          const { isNewConcesionario } = await upsertDealFromHubspot(deal);
          if (isNewConcesionario) newStores++;
          synced++;
        }),
      );
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          failed++;
          logger.error("adminSyncConstrurama: failed to upsert a deal", outcome.reason);
        }
      }
    }

    logger.info(
      `adminSyncConstrurama: done — found ${found.length}, synced ${synced}, ` +
        `${newStores} new stores, ${skippedNoConcesionario} skipped (no Kiosco), ${failed} failed`,
    );

    return {
      ok: true,
      totalFound: found.length,
      synced,
      newStores,
      skippedNoConcesionario,
      failed,
    };
  },
);
