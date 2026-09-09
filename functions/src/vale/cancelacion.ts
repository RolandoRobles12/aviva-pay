import { logger } from "firebase-functions/v2";
import { getCancelStages } from "../firestore/cancelStagesRepository";
import {
  cancelarValesDeDeal,
  getValeVigenteDeDeal,
} from "../firestore/valesRepository";
import { getDeal, patchDealFields } from "../firestore/dealsRepository";
import type { PayDeskDeal } from "../types/deal";


/**
 * Un crédito cancelado tiene que llevarse su vale por delante.
 *
 * Sin esto, el hueco es directo: Aviva cancela el crédito, pero el vale ya
 * está en el celular del cliente y guarda su propia copia del monto, así
 * que la caja lo valida como bueno y la tienda entrega material contra un
 * crédito que ya no existe. El vale no vuelve a consultar el deal por su
 * cuenta — alguien tiene que apagarlo, y ese alguien es este paso del
 * sync.
 *
 * Solo apaga vales `emitido`. Uno ya `utilizado` es historia: el material
 * se entregó antes de la cancelación y apagarlo ahora no cambiaría nada
 * salvo borrar el registro de que se usó.
 *
 * Devuelve los códigos que canceló, para el log.
 */
export async function cancelarValeSiElDealSeCancelo(
  deal: Pick<PayDeskDeal, "dealId" | "dealstage">,
): Promise<string[]> {
  if (!deal.dealstage) return [];

  const etapasCanceladas = await getCancelStages();
  if (!etapasCanceladas.includes(deal.dealstage)) return [];

  // El resumen se calcula ANTES de cancelar: después, el estado del vale
  // ya es "cancelado" y se pierde la única señal de si el cliente llegó a
  // presentarse. Y se calcula una sola vez porque no vuelve a cambiar —
  // un vale cancelado no se puede usar.
  await patchDealFields(deal.dealId, {
    valeResumen: await resumirValeAntesDeMorir(deal.dealId),
  });

  const cancelados = await cancelarValesDeDeal(deal.dealId);
  if (cancelados.length > 0) {
    logger.info(
      `cancelarValeSiElDealSeCancelo: deal ${deal.dealId} entró a la etapa ` +
        `${deal.dealstage}; vales cancelados: ${cancelados.join(", ")}`,
    );
  }
  return cancelados;
}

/**
 * ¿El crédito de este deal ya no existe?
 *
 * Es la red de seguridad de la caja. Lo normal es que el sync ya haya
 * apagado el vale (arriba), pero eso depende de que el workflow de HubSpot
 * dispare en las etapas de cancelación. Si ese workflow se desconfigura,
 * el hueco vuelve a abrirse en silencio y la primera señal sería una
 * tienda entregando material contra un crédito muerto.
 *
 * Así que la validación no confía solo en el estado del vale: mira también
 * la etapa del deal. Cuesta una lectura de Firestore en una operación que
 * ocurre pocas veces al día, y es el camino por el que se entrega dinero.
 */
export async function dealEstaCancelado(dealId: string): Promise<boolean> {
  const deal = await getDeal(dealId);
  if (!deal?.dealstage) return false;
  const etapasCanceladas = await getCancelStages();
  return etapasCanceladas.includes(deal.dealstage);
}


/**
 * Qué alcanzó a pasar con el vale antes de que el crédito muriera.
 *
 * La expiración no tiene etapa propia en HubSpot, así que Paydesk no puede
 * distinguir "lo cancelamos" de "expiró a los 30 días" — y adivinarlo con
 * la fecha metería la regla de negocio en dos lugares que pueden
 * discrepar. Esto reporta un hecho en vez de inferir un motivo, y resulta
 * que el hecho dice más: si el vale nunca se leyó, el cliente nunca llegó
 * al mostrador, que es lo que "expirado" significa en la práctica. Y
 * distingue un caso que ninguna de las dos etiquetas capturaba — el
 * cliente que sí llegó y en el que algo falló en la caja.
 */
async function resumirValeAntesDeMorir(
  dealId: string,
): Promise<PayDeskDeal["valeResumen"]> {
  const vale = await getValeVigenteDeDeal(dealId);
  if (!vale) return "sin-vale";
  if (vale.estado === "utilizado") return "utilizado";
  return vale.lecturasTotal > 0 ? "leido-sin-usar" : "nunca-leido";
}
