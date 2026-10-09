import { logger } from "firebase-functions/v2";
import { env } from "../config/env";
import { updateDealProperties } from "../hubspot/deals";
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
    // Primera vez que vemos esta tienda: HubSpot recibe la liga de acceso
    // para que su workflow de notificación se la pase. El acceso en sí es
    // por persona (correo invitado + contraseña), desde el catálogo.
    await updateDealProperties(deal.dealId, { paydeskUrl: env.payDeskBaseUrl });
    logger.info(`procesarDeal: registered concesionario ${deal.concesionarioId}`);
  }

  return {
    isNewConcesionario,
    valeEmitido: vale.vale !== null,
    valesCancelados: valesCancelados.length,
  };
}
