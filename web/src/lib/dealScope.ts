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

/** True when the store still owes a cotización or comprobante AND the deal is in scope. */
export function requiereAccion(
  deal: PayDeskDeal,
  rolloutDesde: string | null,
): boolean {
  if (scopeOf(deal, rolloutDesde) !== "activa") return false;
  return (
    deal.cotizacionEstatus === "pendiente" ||
    deal.comprobanteEntregaEstatus === "pendiente"
  );
}

/** The seven milestones, in order, as booleans — drives both the progress meter and the funnel report. */
export function milestones(deal: PayDeskDeal): boolean[] {
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
