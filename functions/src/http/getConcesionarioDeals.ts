import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getConcesionariosByIds } from "../firestore/concesionariosRepository";
import { getDealsByConcesionarioIds } from "../firestore/dealsRepository";
import { getFieldLabels } from "../firestore/fieldLabelsRepository";
import { getRollout, resolveRolloutForStore } from "../firestore/rolloutRepository";

/**
 * Returns every deal across every store the signed-in user has access to,
 * plus each store's display name and the current field labels — so the
 * page can render "Fecha de entrega acordada" or whatever the admin has
 * renamed it to, without a deploy.
 *
 * The list of stores comes from the caller's auth token claim
 * (`concesionarioIds`, set by concesionario/userSync.ts when an admin
 * invites this email to a store) — never from the request body, so a
 * client can't ask for another store's data by changing a parameter. A
 * user with access to more than one store sees them combined in one list,
 * distinguished by a "Tienda" column on the frontend.
 */
export const getConcesionarioDeals = onCall(
  { region: "us-central1" },
  async (request) => {
    const concesionarioIds = request.auth?.token?.concesionarioIds as
      | string[]
      | undefined;

    if (!concesionarioIds || concesionarioIds.length === 0) {
      throw new HttpsError(
        "unauthenticated",
        "Tu cuenta no tiene acceso a ninguna tienda todavía.",
      );
    }

    const [concesionarios, deals, labels, rollout] = await Promise.all([
      getConcesionariosByIds(concesionarioIds),
      getDealsByConcesionarioIds(concesionarioIds),
      getFieldLabels(),
      getRollout(),
    ]);

    return {
      concesionarios: concesionarios.map((c) => ({
        concesionarioId: c.concesionarioId,
        nombre: c.nombre,
        numero: c.numero,
      })),
      deals,
      labels,
      // Each store's own cutoff: deals approved before it are historical
      // and never counted as pending. See rolloutRepository.ts. Keyed by
      // concesionarioId since stores can be on different cutoffs.
      rolloutPorTienda: Object.fromEntries(
        concesionarios.map((c) => [
          c.concesionarioId,
          resolveRolloutForStore(rollout, c.rolloutDesde),
        ]),
      ),
    };
  },
);
