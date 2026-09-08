import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { normalizarCodigo } from "../vale/codigo";
import {
  getVale,
  registrarIntentoFallido,
  registrarLectura,
} from "../firestore/valesRepository";
import { evaluarVale, resultadoParaBitacora } from "../vale/validar";
import { cancelarValeSiElDealSeCancelo, dealEstaCancelado } from "../vale/cancelacion";
import { getDeal } from "../firestore/dealsRepository";
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
        motivo: "no-existe",
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

    // Red de seguridad: si el crédito se canceló y el sync no alcanzó a
    // apagar el vale, se apaga aquí mismo antes de contestar. Así la caja
    // nunca ve "válido" por un crédito que ya no existe, aunque el
    // workflow de HubSpot haya fallado.
    if (vale.estado === "emitido" && (await dealEstaCancelado(vale.dealId))) {
      const deal = await getDeal(vale.dealId);
      if (deal) await cancelarValeSiElDealSeCancelo(deal);
      vale.estado = "cancelado";
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
      // También va a la bitácora plana: es la señal que de verdad importa
      // vigilar, y no debe quedar escondida dentro del vale ajeno, que es
      // justo el documento que esa tienda no puede ver.
      await registrarIntentoFallido({
        codigo,
        motivo: "otra-tienda",
        medio,
        concesionarioId: concesionarioIds[0] ?? null,
        uid,
        email,
      });
      logger.warn(
        `validarVale: la tienda ${concesionarioIds[0]} intentó leer el vale ${codigo}, que no es suyo`,
      );
    }

    return resultado;
  },
);
