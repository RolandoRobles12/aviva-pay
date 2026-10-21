import { logger } from "firebase-functions/v2";
import { upsertDealFromHubspot } from "../firestore/dealsRepository";
import { emitirValeParaDeal } from "../vale/emitir";
import { cancelarValeSiElDealSeCancelo } from "../vale/cancelacion";
import type { DealSincronizado } from "../types/deal";

/**
 * Todo lo que pasa cuando llega el estado actual de un deal desde HubSpot,
 * venga del webhook del workflow o de la sincronización periódica que lo
 * respalda. Están en un solo lugar para que las dos rutas no se separen.
 */
export async function procesarDeal(
  deal: DealSincronizado,
  origen: "hubspot-workflow" | "sincronizacion-periodica",
): Promise<{ isNewConcesionario: boolean; valeEmitido: boolean; valesCancelados: number }> {
  const { isNewConcesionario } = await upsertDealFromHubspot(deal);

  // Cancelar va ANTES de emitir, y no es un detalle de orden: si el deal
  // llegara con etapa cancelada y fecha de crédito liberado a la vez,
  // emitir primero crearía un vale vivo para un crédito muerto.
  const valesCancelados = await cancelarValeSiElDealSeCancelo(deal);

  // El vale de un solo uso nace en cuanto el deal trae la fecha de crédito
  // liberado. `emitirValeParaDeal` es idempotente: procesar el mismo deal
  // las veces que sea no genera un segundo vale — ver vale/emitir.ts.
  const vale =
    valesCancelados.length > 0
      ? { vale: null }
      : await emitirValeParaDeal(deal, { emitidoPor: origen });

  if (isNewConcesionario) {
    // Primera vez que vemos esta tienda. Nadie entra todavía: el acceso es
    // por persona y lo da un admin invitando su correo desde el catálogo.
    logger.info(`procesarDeal: registered concesionario ${deal.concesionarioId}`);
  }

  return {
    isNewConcesionario,
    valeEmitido: vale.vale !== null,
    valesCancelados: valesCancelados.length,
  };
}
