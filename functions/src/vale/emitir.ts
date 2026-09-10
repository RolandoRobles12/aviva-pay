import { logger } from "firebase-functions/v2";
import { env } from "../config/env";
import { updateDealProperties } from "../hubspot/deals";
import {
  cancelarValesDeDeal,
  crearVale,
  getValeVigenteDeDeal,
} from "../firestore/valesRepository";
import { getValeConfig } from "../firestore/valeConfigRepository";
import { formatearCodigo } from "./codigo";
import { VALE_ESTADO_HUBSPOT } from "../config/fields";
import type { PayDeskDeal } from "../types/deal";
import type { PayDeskVale } from "../types/vale";

/** La URL que abre el cliente. Es lo que el workflow de HubSpot manda por WhatsApp. */
export function urlDelVale(token: string): string {
  return `${env.payDeskBaseUrl}/vale/${token}`;
}

function calcularVencimiento(vigenciaHoras: number): string {
  return new Date(Date.now() + vigenciaHoras * 60 * 60 * 1000).toISOString();
}

/**
 * Emite el vale de un deal y lo escribe de vuelta en HubSpot.
 *
 * El disparo es la liberación del crédito, y se detecta por
 * `creditoLiberadoFecha`: en cuanto el deal trae esa fecha, el crédito
 * existe y el cliente ya puede ir a la tienda. Preferimos eso a cablear
 * un id de etapa porque esa fecha ya sabe leerse desde varias propiedades
 * de HubSpot a la vez (ver STAGE_DATE_EXTRA_PROPERTIES_DEFAULT y
 * `stageDate()`), así que un deal que llega a la etapa por otro camino
 * — o que vive en el pipeline viejo — también dispara el vale, sin tener
 * que mantener una lista de ids de etapa en dos lugares.
 *
 * Es idempotente: un deal con vale vigente no genera otro, por más veces
 * que el workflow vuelva a disparar. Solo una reemisión explícita de un
 * admin (`forzar`) cancela el anterior y emite uno nuevo.
 */
export async function emitirValeParaDeal(
  deal: Pick<
    PayDeskDeal,
    "dealId" | "concesionarioId" | "cliente" | "montoAprobado" | "creditoLiberadoFecha"
  >,
  opciones: { emitidoPor: string; forzar?: boolean },
): Promise<{ vale: PayDeskVale; reemitido: boolean } | { vale: null; motivo: string }> {
  if (!deal.concesionarioId) {
    return { vale: null, motivo: "sin-concesionario" };
  }
  if (!deal.creditoLiberadoFecha && !opciones.forzar) {
    return { vale: null, motivo: "credito-no-liberado" };
  }

  const vigente = await getValeVigenteDeDeal(deal.dealId);

  if (vigente && !opciones.forzar) {
    return { vale: null, motivo: "ya-tiene-vale" };
  }
  // Un vale ya usado es historia, no algo que se pueda "reemitir": el
  // crédito de ese deal ya se dispuso. Reemitir encima sería emitir un
  // segundo vale por un dinero que ya se entregó.
  if (vigente?.estado === "utilizado") {
    return { vale: null, motivo: "ya-utilizado" };
  }

  const { vigenciaHoras } = await getValeConfig();

  const vale = await crearVale({
    dealId: deal.dealId,
    concesionarioId: deal.concesionarioId,
    cliente: deal.cliente,
    montoAutorizado: deal.montoAprobado,
    venceEn: calcularVencimiento(vigenciaHoras),
    emitidoPor: opciones.emitidoPor,
    reemplazaA: vigente?.codigo ?? null,
  });

  // Después de crear el nuevo, no antes: si la creación falla, el cliente
  // se queda con el vale viejo — que todavía sirve — en vez de con nada.
  const cancelados = await cancelarValesDeDeal(deal.dealId, vale.codigo);

  await updateDealProperties(deal.dealId, {
    valeCodigo: formatearCodigo(vale.codigo),
    valeUrl: urlDelVale(vale.token),
    valeEstado: VALE_ESTADO_HUBSPOT.emitido,
  });

  logger.info(
    `emitirValeParaDeal: vale emitido para deal ${deal.dealId} ` +
      `(tienda ${deal.concesionarioId}, vence ${vale.venceEn}` +
      `${cancelados.length ? `, cancela ${cancelados.join(", ")}` : ""})`,
  );

  return { vale, reemitido: cancelados.length > 0 };
}

