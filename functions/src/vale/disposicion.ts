import type { OrigenDisposicion } from "../firestore/disposicionConfigRepository";
import type { PayDeskDeal } from "../types/deal";

/**
 * La fecha que muestra la columna "Disposición del crédito", según el
 * origen configurado. Con `paydesk` la etapa de HubSpot no cuenta para
 * nada: si la tienda no ha confirmado la venta con el código, el crédito
 * no se ha dispuesto, diga lo que diga la etapa.
 */
export function resolverFechaDisposicion(
  origen: OrigenDisposicion,
  fechas: { paydesk: string | null; hubspot: string | null },
): string | null {
  return origen === "paydesk" ? fechas.paydesk : fechas.hubspot;
}

/**
 * La fecha de HubSpot de un deal guardado. Un deal que no se ha vuelto a
 * sincronizar desde que existe `disposicionHubspotFecha` todavía guarda
 * la de HubSpot en `disposicionCreditoFecha`: antes era la única que
 * había.
 */
export function fechaHubspotGuardada(
  deal: Pick<PayDeskDeal, "disposicionCreditoFecha" | "disposicionHubspotFecha">,
): string | null {
  return deal.disposicionHubspotFecha !== undefined
    ? deal.disposicionHubspotFecha
    : (deal.disposicionCreditoFecha ?? null);
}
