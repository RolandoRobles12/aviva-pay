import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import {
  findConcesionarioByCodigo,
  getConcesionario,
  updateConcesionarioFields,
} from "../../firestore/concesionariosRepository";

interface UpdateRequest {
  concesionarioId?: string;
  nombre?: string;
  codigo?: string;
  /** ISO date (YYYY-MM-DD), or null to fall back to the global rollout date. */
  rolloutDesde?: string | null;
}

/**
 * Renames a store or changes the código it logs in with — this is the
 * "dictionary" part of the catalog: mapping HubSpot's internal Kiosco
 * nomenclature (`#0046 - TEQ CR`) to the name the concesionario actually
 * recognizes.
 */
export const adminUpdateConcesionario = onCall<UpdateRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const { concesionarioId, nombre, codigo, rolloutDesde } = request.data ?? {};

    if (!concesionarioId) {
      throw new HttpsError("invalid-argument", "concesionarioId es requerido");
    }

    const concesionario = await getConcesionario(concesionarioId);
    if (!concesionario) {
      throw new HttpsError("not-found", "Concesionario no encontrado");
    }

    const cambios: {
      nombre?: string;
      codigo?: string;
      rolloutDesde?: string | null;
    } = {};

    if (nombre !== undefined) {
      const limpio = nombre.trim();
      if (!limpio) {
        throw new HttpsError("invalid-argument", "El nombre no puede estar vacío");
      }
      cambios.nombre = limpio;
    }

    if (codigo !== undefined) {
      const limpio = codigo.trim();
      if (!limpio) {
        throw new HttpsError("invalid-argument", "El código no puede estar vacío");
      }
      // Códigos are how stores identify themselves at login, so a
      // duplicate would send one store into another's data.
      if (limpio !== concesionario.codigo) {
        const enUso = await findConcesionarioByCodigo(limpio);
        if (enUso) {
          throw new HttpsError(
            "already-exists",
            `El código "${limpio}" ya lo usa ${enUso.nombre}.`,
          );
        }
      }
      cambios.codigo = limpio;
    }

    if (rolloutDesde !== undefined) {
      if (rolloutDesde !== null && !/^\d{4}-\d{2}-\d{2}$/.test(rolloutDesde)) {
        throw new HttpsError(
          "invalid-argument",
          "La fecha de arranque debe venir como YYYY-MM-DD.",
        );
      }
      cambios.rolloutDesde = rolloutDesde;
    }

    if (Object.keys(cambios).length === 0) {
      return { ok: true, sinCambios: true };
    }

    await updateConcesionarioFields(concesionarioId, cambios);
    logger.info(
      `adminUpdateConcesionario: ${concesionarioId} updated by ${admin.email ?? admin.uid}`,
    );

    return { ok: true };
  },
);
