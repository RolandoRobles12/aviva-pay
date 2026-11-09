import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirAppCheck } from "../auth/appCheck";
import { limitar } from "../auth/rateLimit";
import { esLeccion, type Curso } from "../capacitacion/lecciones";
import { registrarCapacitacion } from "../firestore/capacitacionRepository";

interface GuardarCapacitacionRequest {
  leccion?: string;
  bienvenidaVista?: boolean;
}

/**
 * La tienda (o un vendedor) avisa que pasó una lección (o que ya vio la bienvenida del
 * primer ingreso). Solo agrega: no hay manera de "desaprender" desde aquí,
 * y el avance es de quien llama — el uid sale del token, nunca del cuerpo.
 *
 * Se guarda en el servidor y no en el navegador porque a Aviva le sirve
 * saber quién ya se capacitó antes de contestar una duda, y porque la
 * misma persona usa la caja y su celular.
 */
export const guardarCapacitacion = onCall<GuardarCapacitacionRequest>(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    const lleno = (v: unknown) => Array.isArray(v) && v.length > 0;
    // El curso sale del perfil que trae el token, nunca del cuerpo: un
    // vendedor no puede anotarse lecciones del curso de la tienda.
    const curso: Curso | null = lleno(request.auth?.token?.concesionarioIds)
      ? "tienda"
      : lleno(request.auth?.token?.vendedorIds)
        ? "vendedor"
        : null;
    if (!uid || !curso) {
      throw new HttpsError("unauthenticated", "Inicia sesión con tu tienda para guardar tu avance.");
    }
    exigirAppCheck(request);
    await limitar("guardarCapacitacion", uid, { max: 60, ventanaSeg: 600 });

    const { leccion, bienvenidaVista } = request.data ?? {};
    if (leccion !== undefined && !esLeccion(leccion, curso)) {
      throw new HttpsError("invalid-argument", "Esa lección no existe.");
    }
    if (leccion === undefined && bienvenidaVista !== true) {
      throw new HttpsError("invalid-argument", "No hay nada que guardar.");
    }

    const email = (request.auth?.token?.email as string | undefined)?.toLowerCase() ?? null;
    return registrarCapacitacion(uid, email, curso, {
      leccion,
      bienvenidaVista: bienvenidaVista === true,
    });
  },
);
