import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { getConcesionario } from "../../firestore/concesionariosRepository";
import { getDealsByConcesionario } from "../../firestore/dealsRepository";
import { getFieldLabels } from "../../firestore/fieldLabelsRepository";
import { getEtapas } from "../../firestore/etapasRepository";
import { getVerificacionesDeDeals } from "../../firestore/verificacionesRepository";
import { getRollout, resolveRolloutForStore } from "../../firestore/rolloutRepository";

interface Request {
  concesionarioId?: string;
}

/**
 * Read-only snapshot of what a store sees, for an admin previewing without
 * the store's NIP. Unlike `getConcesionarioDeals`, this takes the
 * concesionarioId from the request rather than an auth claim — admins
 * don't carry one — and it's a one-time fetch rather than the realtime
 * listener the store page uses, since that listener's Firestore rule
 * checks the same claim admins don't have.
 */
export const adminGetConcesionarioDeals = onCall<Request>(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);
    const concesionarioId = request.data?.concesionarioId;

    if (!concesionarioId) {
      throw new HttpsError("invalid-argument", "concesionarioId es requerido");
    }

    const concesionario = await getConcesionario(concesionarioId);
    if (!concesionario) {
      throw new HttpsError("not-found", "Concesionario no encontrado");
    }

    const [deals, labels, rollout, etapas] = await Promise.all([
      getDealsByConcesionario(concesionarioId),
      getFieldLabels(),
      getRollout(),
      getEtapas(),
    ]);

    // La verificación vive aparte (la tienda no la puede leer); para el
    // admin se adjunta a cada deal, como antes.
    const verificaciones = await getVerificacionesDeDeals(deals.map((d) => d.dealId));
    const conVerificacion = deals.map((d) => ({
      ...d,
      cotizacionOcr: verificaciones.get(`${d.dealId}_cotizacion`)?.verificacion ?? null,
      comprobanteOcr: verificaciones.get(`${d.dealId}_comprobante`)?.verificacion ?? null,
    }));

    return {
      concesionario: {
        concesionarioId: concesionario.concesionarioId,
        nombre: concesionario.nombre,
        numero: concesionario.numero,
      },
      deals: conVerificacion,
      labels,
      etapas,
      // The cutoff this store is held to: deals approved before it are
      // historical and never counted as pending. See rolloutRepository.ts.
      rolloutDesde: resolveRolloutForStore(rollout, concesionario.rolloutDesde),
    };
  },
);
