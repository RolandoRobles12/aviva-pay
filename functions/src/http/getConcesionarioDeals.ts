import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getConcesionario } from "../firestore/concesionariosRepository";
import { getDealsByConcesionario } from "../firestore/dealsRepository";
import { getFieldLabels } from "../firestore/fieldLabelsRepository";

/**
 * Returns the signed-in store's deals plus its display name and the
 * current field labels — so the page can render "Fecha de entrega
 * acordada" or whatever the admin has renamed it to, without a deploy.
 *
 * The concesionarioId comes from the caller's auth token claim — set by
 * loginConcesionario after checking the código and NIP — never from the
 * request body, so a client can't ask for another store's data by
 * changing a parameter.
 */
export const getConcesionarioDeals = onCall(
  { region: "us-central1" },
  async (request) => {
    const concesionarioId = request.auth?.token?.concesionarioId as
      | string
      | undefined;

    if (!concesionarioId) {
      throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
    }

    const concesionario = await getConcesionario(concesionarioId);
    if (!concesionario) {
      throw new HttpsError(
        "not-found",
        "No se encontró información para este concesionario.",
      );
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
