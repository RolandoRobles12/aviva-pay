import type { PayDeskDeal } from "../types/deal";
import type { EtapaConfig } from "../types/admin";

/**
 * Each store's rollout cutoff, keyed by concesionarioId. A user can see
 * deals from more than one store (see ConcesionarioLayout.tsx — deals from
 * every store the signed-in user has access to are shown in one combined
 * list), and different stores can have gone live on different dates, so
 * "the" cutoff is only ever meaningful per deal, resolved via its own
 * concesionarioId.
 */
export type RolloutMap = Record<string, string | null>;

function cutoffFor(deal: PayDeskDeal, rolloutPorTienda: RolloutMap): string | null {
  return rolloutPorTienda[deal.concesionarioId ?? ""] ?? null;
}

/**
 * Where a solicitud sits relative to Paydesk's rollout, and therefore
 * whether the store is on the hook for anything.
 *
 * - `historica` — approved before this store's cutoff. Its sale already
 *   closed outside Paydesk, so there is no cotización or comprobante left
 *   to upload. Shown for visibility, never counted as pending, never
 *   nagged about. Uploading is still *allowed*, just not asked for.
 * - `activa` — approved on or after the cutoff. This is the store's real
 *   worklist.
 *
 * With no cutoff set yet (`null`) everything reads as historical. That's
 * the safe default while the rollout date is still undecided: a store
 * never gets chased for paperwork that doesn't exist, and the number
 * stops being alarming the day the real date is set.
 */
export type DealScope = "activa" | "historica";

export function scopeOf(deal: PayDeskDeal, rolloutPorTienda: RolloutMap): DealScope {
  const rolloutDesde = cutoffFor(deal, rolloutPorTienda);
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
export function requiereAccion(deal: PayDeskDeal, rolloutPorTienda: RolloutMap): boolean {
  if (desembolsada(deal)) return false;
  if (scopeOf(deal, rolloutPorTienda) !== "activa") return false;
  // Un documento en revisión ya no depende de la tienda: espera a Aviva.
  return (
    (deal.cotizacionEstatus === "pendiente" &&
      deal.cotizacionRevision?.estado !== "pendiente") ||
    (deal.comprobanteEntregaEstatus === "pendiente" &&
      deal.comprobanteRevision?.estado !== "pendiente")
  );
}

/** Etapas por defecto: las siete base, en orden. Se usan hasta que llega la config del admin. */
export const ETAPAS_DEFAULT: EtapaConfig[] = [
  { id: "solicitud", label: "Solicitud aprobada", tipo: "base" },
  { id: "kyc", label: "KYC", tipo: "base" },
  { id: "cotizacion", label: "Cotización", tipo: "base" },
  { id: "credito", label: "Crédito liberado", tipo: "base" },
  { id: "disposicion", label: "Disposición", tipo: "base" },
  { id: "comprobante", label: "Comprobante", tipo: "base" },
  { id: "desembolso", label: "Desembolso", tipo: "base" },
];

/**
 * Las etapas en uso, tal como las configuró el admin. Es estado de módulo
 * a propósito: `completados`, `estaCompleta`, el orden por avance y los
 * filtros las leen sin que cada llamador tenga que cargarlas. Quien reciba
 * la config del servidor la fija con `setEtapas` antes de pintar.
 */
let etapasActivas: EtapaConfig[] = ETAPAS_DEFAULT;

export function setEtapas(etapas: EtapaConfig[] | undefined) {
  etapasActivas = etapas && etapas.length > 0 ? etapas : ETAPAS_DEFAULT;
}

export function getEtapas(): EtapaConfig[] {
  return etapasActivas;
}

function alcanzada(deal: PayDeskDeal, etapa: EtapaConfig): boolean {
  if (etapa.tipo === "personalizada") return Boolean(deal.etapasExtra?.[etapa.id]);
  switch (etapa.id) {
    case "solicitud":
      return Boolean(deal.fechaSolicitud);
    case "kyc":
      return Boolean(deal.estatusKyc);
    case "cotizacion":
      return deal.cotizacionEstatus === "completado";
    case "credito":
      return Boolean(deal.creditoLiberadoFecha);
    case "disposicion":
      return Boolean(deal.disposicionCreditoFecha);
    case "comprobante":
      return deal.comprobanteEntregaEstatus === "completado";
    case "desembolso":
      return Boolean(deal.desembolsoFecha);
    default:
      return false;
  }
}

/** Las etapas configuradas, en orden, como booleanos — alimenta la barra de avance y el embudo del reporte. */
export function milestones(deal: PayDeskDeal): boolean[] {
  if (desembolsada(deal)) return etapasActivas.map(() => true);
  return etapasActivas.map((e) => alcanzada(deal, e));
}

export function completados(deal: PayDeskDeal): number {
  return milestones(deal).filter(Boolean).length;
}

/** A deal is done when every milestone is in. */
export function estaCompleta(deal: PayDeskDeal): boolean {
  return completados(deal) === milestones(deal).length;
}
