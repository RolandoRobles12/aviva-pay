import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getDeal } from "../firestore/dealsRepository";

interface GetDealStatusRequest {
  dealId?: string;
}

/**
 * Callable function the frontend invokes on page load with the dealId from
 * the URL (section 6: "La página nunca lee Firestore directo desde el
 * cliente"). Returns the current deal snapshot plus a short-lived custom
 * auth token scoped to that single dealId (custom claim), which the client
 * then uses to open a direct Firestore `onSnapshot` listener for realtime
 * updates (section 6). The Firestore security rules (see firestore.rules)
 * only allow `get`, never `list`, and only when the claim matches the
 * requested document — so this never allows enumerating other deals.
 */
export const getDealStatus = onCall<GetDealStatusRequest>(
  { region: "us-central1" },
  async (request) => {
    const dealId = request.data?.dealId;
    if (!dealId || typeof dealId !== "string") {
      throw new HttpsError("invalid-argument", "dealId is required");
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      // Deliberately generic: don't reveal whether the dealId is
      // malformed vs. simply not synced yet.
      throw new HttpsError("not-found", "No se encontró la solicitud.");
    }

    const authToken = await getAuth().createCustomToken(`paydesk:${dealId}`, {
      dealId,
    });

    return { deal, authToken };
  },
);
