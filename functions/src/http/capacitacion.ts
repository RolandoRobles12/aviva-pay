import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirAppCheck } from "../auth/appCheck";
import { limitar } from "../auth/rateLimit";
import { esLeccion } from "../capacitacion/lecciones";
import { registrarCapacitacion } from "../firestore/capacitacionRepository";

interface GuardarCapacitacionRequest {
  leccion?: string;
  bienvenidaVista?: boolean;
}

/**
 * La tienda avisa que pasó una lección (o que ya vio la bienvenida del
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
    const concesionarioIds = request.auth?.token?.concesionarioIds as string[] | undefined;
    if (!uid || !concesionarioIds || concesionarioIds.length === 0) {
      throw new HttpsError("unauthenticated", "Inicia sesión con tu tienda para guardar tu avance.");
    }
    exigirAppCheck(request);
    await limitar("guardarCapacitacion", uid, { max: 60, ventanaSeg: 600 });

    const { leccion, bienvenidaVista } = request.data ?? {};
    if (leccion !== undefined && !esLeccion(leccion)) {
      throw new HttpsError("invalid-argument", "Esa lección no existe.");
    }
    if (leccion === undefined && bienvenidaVista !== true) {
      throw new HttpsError("invalid-argument", "No hay nada que guardar.");
    }

    const email = (request.auth?.token?.email as string | undefined)?.toLowerCase() ?? null;
    return registrarCapacitacion(uid, email, {
      leccion,
      bienvenidaVista: bienvenidaVista === true,
    });
  },
);
