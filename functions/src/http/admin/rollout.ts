import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import { getRollout, setRollout } from "../../firestore/rolloutRepository";

export const adminGetRollout = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return await getRollout();
});

interface SetRequest {
  /** ISO date (YYYY-MM-DD), or null to clear it back to "not rolled out yet". */
  fechaRollout?: string | null;
}

/**
 * Sets the date from which stores are actually asked for cotizaciones and
 * comprobantes. See rolloutRepository.ts for what the cutoff means and why
 * null is the safe default.
 */
export const adminSetRollout = onCall<SetRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const fecha = request.data?.fechaRollout;

    if (fecha !== null && fecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new HttpsError("invalid-argument", "La fecha debe venir como YYYY-MM-DD.");
    }

    await setRollout(fecha ?? null, admin.email ?? admin.uid);
    logger.info(
      `adminSetRollout: set to ${fecha ?? "null"} by ${admin.email ?? admin.uid}`,
    );

    return { ok: true };
  },
);
