import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import {
  getConcesionario,
  updateConcesionarioFields,
} from "../../firestore/concesionariosRepository";
import { syncConcesionarioUsuarios } from "../../concesionario/userSync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UpdateRequest {
  concesionarioId?: string;
  nombre?: string;
  /** Full replacement list of invited emails for this store, or omit to leave untouched. */
  usuarios?: string[];
  /** ISO date (YYYY-MM-DD), or null to fall back to the global rollout date. */
  rolloutDesde?: string | null;
}

/**
 * Renames a store, sets which emails can sign in to it, and/or its rollout
 * cutoff. Changing `usuarios` diffs against the stored list and invites
 * (or de-invites) exactly the emails that changed — see
 * concesionario/userSync.ts for what "invite" actually does to Firebase
 * Auth and each user's claim.
 */
export const adminUpdateConcesionario = onCall<UpdateRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const { concesionarioId, nombre, usuarios, rolloutDesde } = request.data ?? {};

    if (!concesionarioId) {
      throw new HttpsError("invalid-argument", "concesionarioId es requerido");
    }

    const concesionario = await getConcesionario(concesionarioId);
    if (!concesionario) {
      throw new HttpsError("not-found", "Concesionario no encontrado");
    }

    const cambios: {
      nombre?: string;
      usuarios?: string[];
      rolloutDesde?: string | null;
    } = {};

    if (nombre !== undefined) {
      const limpio = nombre.trim();
      if (!limpio) {
        throw new HttpsError("invalid-argument", "El nombre no puede estar vacío");
      }
      cambios.nombre = limpio;
    }

    let nuevosUsuarios: string[] | undefined;
    if (usuarios !== undefined) {
      const limpios = usuarios.map((e) => e.trim().toLowerCase()).filter(Boolean);
      for (const email of limpios) {
        if (!EMAIL_RE.test(email)) {
          throw new HttpsError("invalid-argument", `Correo inválido: "${email}"`);
        }
      }
      nuevosUsuarios = [...new Set(limpios)];
      cambios.usuarios = nuevosUsuarios;
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
      return { ok: true, sinCambios: true, invitados: [] };
    }

    let invitados: string[] = [];
    if (nuevosUsuarios !== undefined) {
      const resultado = await syncConcesionarioUsuarios(
        concesionarioId,
        concesionario.usuarios ?? [],
        nuevosUsuarios,
      );
      invitados = resultado.invitados;
    }

    await updateConcesionarioFields(concesionarioId, cambios);
    logger.info(
      `adminUpdateConcesionario: ${concesionarioId} updated by ${admin.email ?? admin.uid}` +
        (invitados.length ? ` (invited: ${invitados.join(", ")})` : ""),
    );

    return { ok: true, invitados };
  },
);
