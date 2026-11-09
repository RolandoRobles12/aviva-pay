import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import {
  getConcesionario,
  updateConcesionarioFields,
} from "../../firestore/concesionariosRepository";
import { syncConcesionarioUsuarios } from "../../concesionario/userSync";
import { correosEnAmbas, limpiarCorreos } from "../../vendedor/proyeccion";

interface UpdateRequest {
  concesionarioId?: string;
  nombre?: string;
  /** Full replacement list of invited emails for this store, or omit to leave untouched. */
  usuarios?: string[];
  /** Lista completa de vendedores externos (solo consulta), u omitir para no tocarla. */
  vendedores?: string[];
  /** ISO date (YYYY-MM-DD), or null to fall back to the global rollout date. */
  rolloutDesde?: string | null;
}

/**
 * Renames a store, sets which emails can sign in to it, and/or its rollout
 * cutoff. Changing `usuarios` diffs against the stored list and invites
 * (or de-invites) exactly the emails that changed — see
 * concesionario/userSync.ts for what "invite" actually does to Firebase
 * Auth and each user's claim.
 *
 * Returns the added emails split in two: `invitados` still need the
 * "create your password" email (the caller sends it), and `yaActivos`
 * already have a working password from another store and must not be
 * emailed again.
 */
export const adminUpdateConcesionario = onCall<UpdateRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const { concesionarioId, nombre, usuarios, vendedores, rolloutDesde } = request.data ?? {};

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
      vendedores?: string[];
      rolloutDesde?: string | null;
    } = {};

    if (nombre !== undefined) {
      const limpio = nombre.trim();
      if (!limpio) {
        throw new HttpsError("invalid-argument", "El nombre no puede estar vacío");
      }
      cambios.nombre = limpio;
    }

    const limpiar = (lista: string[]) => {
      const r = limpiarCorreos(lista);
      if ("invalido" in r) {
        throw new HttpsError("invalid-argument", `Correo inválido: "${r.invalido}"`);
      }
      return r.correos;
    };

    let nuevosUsuarios: string[] | undefined;
    if (usuarios !== undefined) {
      nuevosUsuarios = limpiar(usuarios);
      cambios.usuarios = nuevosUsuarios;
    }

    let nuevosVendedores: string[] | undefined;
    if (vendedores !== undefined) {
      nuevosVendedores = limpiar(vendedores);
      cambios.vendedores = nuevosVendedores;
    }

    // En la misma tienda, un correo es de la tienda o es vendedor externo,
    // nunca las dos: con las dos tendría acceso completo y la etiqueta de
    // "solo consulta" mentiría.
    const repetidos = correosEnAmbas(
      nuevosUsuarios ?? concesionario.usuarios ?? [],
      nuevosVendedores ?? concesionario.vendedores ?? [],
    );
    if (repetidos.length > 0) {
      throw new HttpsError(
        "invalid-argument",
        `${repetidos.join(", ")} no puede ser usuario de la tienda y vendedor externo a la vez. Déjalo en una sola lista.`,
      );
    }

    if (rolloutDesde !== undefined) {
      // La fecha de arranque decide qué se le exige a la tienda: es
      // configuración, no operación, así que solo la cambia un super admin.
      // Un operador puede mandarla igual a la que ya tiene (el formulario
      // envía todos los campos) sin que eso cuente como cambio.
      if (admin.rol !== "super" && rolloutDesde !== (concesionario.rolloutDesde ?? null)) {
        throw new HttpsError(
          "permission-denied",
          "Solo un super administrador puede cambiar la fecha de arranque de una tienda.",
        );
      }
      if (rolloutDesde !== null && !/^\d{4}-\d{2}-\d{2}$/.test(rolloutDesde)) {
        throw new HttpsError(
          "invalid-argument",
          "La fecha de arranque debe venir como YYYY-MM-DD.",
        );
      }
      cambios.rolloutDesde = rolloutDesde;
    }

    if (Object.keys(cambios).length === 0) {
      return { ok: true, sinCambios: true, invitados: [], yaActivos: [] };
    }

    let invitados: string[] = [];
    let yaActivos: string[] = [];
    if (nuevosUsuarios !== undefined) {
      const resultado = await syncConcesionarioUsuarios(
        concesionarioId,
        concesionario.usuarios ?? [],
        nuevosUsuarios,
      );
      invitados = resultado.invitados;
      yaActivos = resultado.yaActivos;
    }
    if (nuevosVendedores !== undefined) {
      const resultado = await syncConcesionarioUsuarios(
        concesionarioId,
        concesionario.vendedores ?? [],
        nuevosVendedores,
        "vendedorIds",
      );
      invitados = [...invitados, ...resultado.invitados];
      yaActivos = [...yaActivos, ...resultado.yaActivos];
    }

    await updateConcesionarioFields(concesionarioId, cambios);
    logger.info(
      `adminUpdateConcesionario: ${concesionarioId} updated by ${admin.email ?? admin.uid}` +
        (invitados.length ? ` (invited: ${invitados.join(", ")})` : "") +
        (yaActivos.length
          ? ` (already active, no email sent: ${yaActivos.join(", ")})`
          : ""),
    );

    return { ok: true, invitados, yaActivos };
  },
);
