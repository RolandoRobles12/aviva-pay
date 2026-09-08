import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { normalizarCodigo } from "../vale/codigo";
import { consumirVale, getVale } from "../firestore/valesRepository";
import { evaluarVale } from "../vale/validar";
import { updateDealProperties } from "../hubspot/deals";
import { VALE_ESTADO_HUBSPOT } from "../config/fields";

interface ConfirmarRequest {
  codigo?: string;
  /** Lo que se gastó de verdad, que puede ser menos que el autorizado. */
  montoDispuesto?: number;
}

/**
 * El paso que sí quema el vale: la tienda confirma que entregó material y
 * por cuánto.
 *
 * El monto se captura aquí, no se asume igual al autorizado, y es lo que
 * convierte esto en el dato que hoy no existe: cuándo se gastó el crédito
 * y cuánto de él. Puede ser menor al autorizado (el cliente compró menos);
 * mayor nunca, porque sería entregar material por encima de lo que Aviva
 * respaldó.
 *
 * El consumo va en transacción (ver consumirVale): dos cajas de la misma
 * tienda pueden confirmar el mismo vale a la vez, y solo una debe ganar.
 */
export const confirmarDisposicion = onCall<ConfirmarRequest>(
  { region: "us-central1", secrets: ["HUBSPOT_PRIVATE_APP_TOKEN"] },
  async (request) => {
    const concesionarioIds = request.auth?.token?.concesionarioIds as
      | string[]
      | undefined;
    const uid = request.auth?.uid;

    if (!uid || !concesionarioIds || concesionarioIds.length === 0) {
      throw new HttpsError(
        "unauthenticated",
        "Inicia sesión con tu tienda para confirmar una disposición.",
      );
    }

    const codigo = normalizarCodigo(request.data?.codigo ?? "");
    if (!codigo) {
      throw new HttpsError("invalid-argument", "El código debe traer 10 dígitos.");
    }

    const monto = Number(request.data?.montoDispuesto);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "Captura el monto de la venta para poder confirmar.",
      );
    }

    // Se revalida aquí en vez de confiar en lo que la caja vio hace un
    // momento: entre la lectura y la confirmación el vale pudo vencer, o
    // lo pudo consumir la otra caja.
    const vale = await getVale(codigo);
    const resultado = evaluarVale(vale, concesionarioIds);
    if (resultado.estado !== "ok") {
      return { ok: false as const, ...resultado };
    }

    if (
      vale?.montoAutorizado !== null &&
      vale?.montoAutorizado !== undefined &&
      monto > vale.montoAutorizado
    ) {
      throw new HttpsError(
        "invalid-argument",
        "El monto de la venta no puede ser mayor al crédito autorizado.",
      );
    }

    const consumido = await consumirVale(codigo, { uid, montoDispuesto: monto });
    if (!consumido) {
      // Perdió la carrera contra otra caja: el vale ya no está disponible.
      const actual = await getVale(codigo);
      return { ok: false as const, ...evaluarVale(actual, concesionarioIds) };
    }

    // Solo el estado. La fecha de disposición la estampa HubSpot solo
    // cuando un workflow —disparado por este mismo estado— mueve el deal a
    // la etapa de disposición; y el monto de la compra ya vive en la
    // propiedad de la cotización, que significa otra cosa y no se pisa.
    // El monto realmente dispuesto queda en el vale y en /admin/vales.
    await updateDealProperties(consumido.dealId, {
      valeEstado: VALE_ESTADO_HUBSPOT.utilizado,
    });

    logger.info(
      `confirmarDisposicion: vale ${codigo} consumido por ${uid} ` +
        `(deal ${consumido.dealId}, ${monto} de ${consumido.montoAutorizado ?? "?"})`,
    );

    return {
      ok: true as const,
      codigo,
      montoDispuesto: monto,
      cliente: consumido.cliente,
    };
  },
);
