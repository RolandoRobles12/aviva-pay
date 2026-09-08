import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { normalizarCodigo } from "../vale/codigo";
import {
  getVale,
  registrarIntentoFallido,
  registrarLectura,
} from "../firestore/valesRepository";
import { evaluarVale, resultadoParaBitacora } from "../vale/validar";
import type { ValeMedioLectura } from "../types/vale";

interface ValidarRequest {
  codigo?: string;
  medio?: ValeMedioLectura;
}

/**
 * Lo que hace la caja cuando escanea o teclea el código del cliente.
 *
 * **Leer no es usar.** Esta función nunca consume el vale: solo dice si
 * sirve y por cuánto, para que la tienda pueda consultarlo sin gastarlo.
 * Consumirlo es un paso aparte y explícito (confirmarDisposicion).
 *
 * Toda lectura queda registrada, incluidas las que fallan — es la
 * bitácora la que delata un vale que anda circulando entre tiendas o a
 * alguien probando códigos. Por eso la función exige sesión de tienda:
 * sin ella no habría a quién anotarle el intento, y el código corto sería
 * atacable a ciegas.
 */
export const validarVale = onCall<ValidarRequest>(
  { region: "us-central1" },
  async (request) => {
    const concesionarioIds = request.auth?.token?.concesionarioIds as
      | string[]
      | undefined;
    const uid = request.auth?.uid;

    if (!uid || !concesionarioIds || concesionarioIds.length === 0) {
      throw new HttpsError(
        "unauthenticated",
        "Inicia sesión con tu tienda para validar un código.",
      );
    }

    const medio: ValeMedioLectura =
      request.data?.medio === "escaneo" ? "escaneo" : "manual";
    const crudo = request.data?.codigo ?? "";
    const codigo = normalizarCodigo(crudo);

    // Un código a medio teclear no es un intento: es alguien escribiendo.
    // Solo se registra cuando ya tiene la forma de un código real.
    if (!codigo) {
      return { estado: "no-existe" as const };
    }

    const email = request.auth?.token?.email ?? null;
    const vale = await getVale(codigo);

    // El código que no existe se resuelve aquí, antes de evaluar: no hay
    // vale al que colgarle la bitácora, así que el intento va a su propia
    // colección.
    if (!vale) {
      await registrarIntentoFallido({
        codigo,
        medio,
        concesionarioId: concesionarioIds[0] ?? null,
        uid,
        email,
      });
      logger.warn(
        `validarVale: código ${codigo} no existe (tienda ${concesionarioIds[0]})`,
      );
      return { estado: "no-existe" as const };
    }

    const resultado = evaluarVale(vale, concesionarioIds);

    await registrarLectura(vale, {
      resultado: resultadoParaBitacora(resultado),
      medio,
      concesionarioId: concesionarioIds[0] ?? null,
      uid,
      email,
    });

    if (resultado.estado === "otra-tienda") {
      logger.warn(
        `validarVale: la tienda ${concesionarioIds[0]} intentó leer el vale ${codigo}, que no es suyo`,
      );
    }

    return resultado;
  },
);
