import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import {
  concesionarioExists,
  getDealsByConcesionario,
} from "../firestore/dealsRepository";

interface GetConcesionarioDealsRequest {
  concesionarioId?: string;
}

/**
 * Callable function the frontend invokes on page load with the
 * concesionarioId from the URL (section 6: "La página nunca lee Firestore
 * directo desde el cliente"). Returns every deal synced for that
 * concesionario, plus a short-lived custom auth token scoped to that single
 * concesionarioId (custom claim), which the client then uses to open a
 * direct Firestore query listener for realtime updates (section 6). The
 * Firestore security rules (see firestore.rules) only allow a query
 * filtered to that exact concesionarioId — so this never allows
 * enumerating other concesionarios' deals.
 */
export const getConcesionarioDeals = onCall<GetConcesionarioDealsRequest>(
  { region: "us-central1" },
  async (request) => {
    const concesionarioId = request.data?.concesionarioId;
    if (!concesionarioId || typeof concesionarioId !== "string") {
      throw new HttpsError("invalid-argument", "concesionarioId is required");
    }

    const exists = await concesionarioExists(concesionarioId);
    if (!exists) {
      // Deliberately generic: don't reveal whether the id is malformed vs.
      // simply not synced yet.
      throw new HttpsError("not-found", "No se encontró información para este concesionario.");
    }

    const deals = await getDealsByConcesionario(concesionarioId);

    const authToken = await getAuth().createCustomToken(
      `paydesk:${concesionarioId}`,
      { concesionarioId },
    );

    return { deals, authToken };
  },
);
