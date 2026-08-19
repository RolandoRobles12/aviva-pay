import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import {
  findConcesionarioByCodigo,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../firestore/concesionariosRepository";
import { verifyNip } from "../auth/nip";

interface LoginRequest {
  codigo?: string;
  nip?: string;
}

/** Failed attempts allowed before the store is locked out. */
const MAX_INTENTOS = 5;
/** How long the lockout lasts. */
const BLOQUEO_MINUTOS = 15;

/**
 * Deliberately identical message for "no such código", "wrong NIP" and
 * "store has no NIP yet". Distinguishing them would let anyone probe which
 * códigos exist.
 */
const CREDENCIALES_INVALIDAS =
  "Código o NIP incorrecto. Verifica tus datos e inténtalo de nuevo.";

/**
 * Logs a concesionario in with their código + NIP and returns a custom
 * auth token whose only claim is their concesionarioId. The client signs
 * in with that token, which is what lets it read its own store's deals in
 * realtime while the Firestore rules keep every other store out of reach.
 *
 * A 6-digit NIP is small enough to brute force online, so failed attempts
 * are counted and the store is locked out for BLOQUEO_MINUTOS after
 * MAX_INTENTOS. The counter lives on the store document, so the lockout
 * holds across Cloud Function instances.
 */
export const loginConcesionario = onCall<LoginRequest>(
  { region: "us-central1" },
  async (request) => {
    const codigo = request.data?.codigo?.trim();
    const nip = request.data?.nip?.trim();

    if (!codigo || !nip) {
      throw new HttpsError("invalid-argument", "Captura tu código y tu NIP.");
    }

    const concesionario = await findConcesionarioByCodigo(codigo);
    if (!concesionario) {
      throw new HttpsError("unauthenticated", CREDENCIALES_INVALIDAS);
    }

    const ahora = Timestamp.now();
    if (
      concesionario.bloqueadoHasta &&
      concesionario.bloqueadoHasta.toMillis() > ahora.toMillis()
    ) {
      throw new HttpsError(
        "permission-denied",
        `Demasiados intentos fallidos. Vuelve a intentarlo en ${BLOQUEO_MINUTOS} minutos o contacta a Aviva.`,
      );
    }

    const nipValido =
      concesionario.nipHash !== null &&
      (await verifyNip(nip, concesionario.nipHash));

    if (!nipValido) {
      const intentos = concesionario.intentosFallidos + 1;
      const bloquear = intentos >= MAX_INTENTOS;
      await recordFailedLogin(
        concesionario.concesionarioId,
        bloquear
          ? Timestamp.fromMillis(ahora.toMillis() + BLOQUEO_MINUTOS * 60_000)
          : null,
      );
      logger.warn(
        `loginConcesionario: failed attempt ${intentos} for ${concesionario.concesionarioId}`,
      );
      throw new HttpsError("unauthenticated", CREDENCIALES_INVALIDAS);
    }

    await recordSuccessfulLogin(concesionario.concesionarioId);

    const authToken = await getAuth().createCustomToken(
      `paydesk:${concesionario.concesionarioId}`,
      { concesionarioId: concesionario.concesionarioId },
    );

    return {
      authToken,
      concesionario: {
        concesionarioId: concesionario.concesionarioId,
        nombre: concesionario.nombre,
        numero: concesionario.numero,
      },
    };
  },
);
