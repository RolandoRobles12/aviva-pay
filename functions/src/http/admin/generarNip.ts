import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { assertAdmin } from "../../auth/adminGuard";
import {
  clearLockout,
  getConcesionario,
  updateConcesionarioFields,
} from "../../firestore/concesionariosRepository";
import { generateNip, hashNip } from "../../auth/nip";

interface GenerarNipRequest {
  concesionarioId?: string;
}

/**
 * Issues a new NIP for a store and returns it **once**, in this response.
 * Only the scrypt hash is stored, so the plaintext can never be recovered
 * afterwards — if the admin loses it before passing it to the store, the
 * fix is to generate another one.
 *
 * Generating also clears any lockout, which doubles as the "unblock this
 * store" action when a concesionario locks themselves out.
 */
export const adminGenerarNip = onCall<GenerarNipRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const concesionarioId = request.data?.concesionarioId;

    if (!concesionarioId) {
      throw new HttpsError("invalid-argument", "concesionarioId es requerido");
    }

    const concesionario = await getConcesionario(concesionarioId);
    if (!concesionario) {
      throw new HttpsError("not-found", "Concesionario no encontrado");
    }

    const nip = generateNip();
    await updateConcesionarioFields(concesionarioId, {
      nipHash: await hashNip(nip),
      nipActualizadoEn: FieldValue.serverTimestamp(),
    });

    await clearLockout(concesionarioId);

    logger.info(
      `adminGenerarNip: new NIP issued for ${concesionarioId} by ${admin.email ?? admin.uid}`,
    );

    return { nip };
  },
);
