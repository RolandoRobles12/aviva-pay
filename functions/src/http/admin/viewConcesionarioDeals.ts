import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { getConcesionario } from "../../firestore/concesionariosRepository";
import { getDealsByConcesionario } from "../../firestore/dealsRepository";
import { getFieldLabels } from "../../firestore/fieldLabelsRepository";

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

    const [deals, labels] = await Promise.all([
      getDealsByConcesionario(concesionarioId),
      getFieldLabels(),
    ]);

    return {
      concesionario: {
        concesionarioId: concesionario.concesionarioId,
        nombre: concesionario.nombre,
        numero: concesionario.numero,
      },
      deals,
      labels,
    };
  },
);
