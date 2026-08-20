import type { PayDeskDeal } from "../types/deal";

/**
 * Where a solicitud sits relative to Pay Desk's rollout, and therefore
 * whether the store is on the hook for anything.
 *
 * - `historica` — approved before this store's cutoff. Its sale already
 *   closed outside Pay Desk, so there is no cotización or comprobante left
 *   to upload. Shown for visibility, never counted as pending, never
 *   nagged about. Uploading is still *allowed*, just not asked for.
 * - `activa` — approved on or after the cutoff. This is the store's real
 *   worklist.
 *
 * With no cutoff set yet (`rolloutDesde === null`) everything reads as
 * historical. That's the safe default while the rollout date is still
 * undecided: a store never gets chased for paperwork that doesn't exist,
 * and the number stops being alarming the day the real date is set.
 */
export type DealScope = "activa" | "historica";

export function scopeOf(
  deal: PayDeskDeal,
  rolloutDesde: string | null,
): DealScope {
  if (!rolloutDesde) return "historica";
  // Approved-date unknown: treat as live rather than silently hiding a
  // deal the store may well owe work on.
  if (!deal.fechaSolicitud) return "activa";
  return deal.fechaSolicitud.slice(0, 10) >= rolloutDesde ? "activa" : "historica";
}

/**
 * Desembolso is the terminal stage — the money already moved. Once that's
 * true the deal is done, full stop, regardless of whether every
 * intermediate stage-entered property along the way happens to be
 * populated: those can be missing for reasons that have nothing to do
 * with whether the deal actually finished (a legacy-pipeline deal whose
 * stage ids don't match the current dictionary, a step HubSpot recorded
 * differently). Trusting the terminal state over the intermediate trail
 * is what a store actually needs — a loan flagged "3/7, cotización
 * pendiente" when the money already disbursed reads as broken, not as
 * "some data is missing."
 */
function desembolsada(deal: PayDeskDeal): boolean {
  return Boolean(deal.desembolsoFecha);
}

/** True when the store still owes a cotización or comprobante AND the deal is in scope. */
export function requiereAccion(
  deal: PayDeskDeal,
  rolloutDesde: string | null,
): boolean {
  if (desembolsada(deal)) return false;
  if (scopeOf(deal, rolloutDesde) !== "activa") return false;
  return (
    deal.cotizacionEstatus === "pendiente" ||
    deal.comprobanteEntregaEstatus === "pendiente"
  );
}

/** The seven milestones, in order, as booleans — drives both the progress meter and the funnel report. */
export function milestones(deal: PayDeskDeal): boolean[] {
  if (desembolsada(deal)) return [true, true, true, true, true, true, true];
  return [
    Boolean(deal.fechaSolicitud),
    Boolean(deal.estatusKyc),
    deal.cotizacionEstatus === "completado",
    Boolean(deal.creditoLiberadoFecha),
    Boolean(deal.disposicionCreditoFecha),
    deal.comprobanteEntregaEstatus === "completado",
    Boolean(deal.desembolsoFecha),
  ];
}

export const MILESTONE_LABELS = [
  "Solicitud aprobada",
  "KYC",
  "Cotización",
  "Crédito liberado",
  "Disposición",
  "Comprobante",
  "Desembolso",
] as const;

export function completados(deal: PayDeskDeal): number {
  return milestones(deal).filter(Boolean).length;
}

/** A deal is done when every milestone is in. */
export function estaCompleta(deal: PayDeskDeal): boolean {
  return completados(deal) === milestones(deal).length;
}
