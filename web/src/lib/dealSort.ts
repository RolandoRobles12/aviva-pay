import type { PayDeskDeal } from "../types/deal";
import { completados } from "./dealScope";

export type SortKey =
  | "cliente"
  | "tienda"
  | "avance"
  | "fechaSolicitud"
  | "montoAprobado"
  | "estatusKyc"
  | "cotizacion"
  | "creditoLiberadoFecha"
  | "disposicionCreditoFecha"
  | "comprobante"
  | "desembolsoFecha";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

/** A comparable value per column: string, number, or null for "not there yet". */
function valorDe(
  deal: PayDeskDeal,
  key: SortKey,
  concesionarioNombres: Record<string, string>,
): string | number | null {
  switch (key) {
    case "cliente":
      return deal.cliente;
    case "tienda":
      return deal.concesionarioId ? concesionarioNombres[deal.concesionarioId] ?? null : null;
    case "avance":
      return completados(deal);
    case "fechaSolicitud":
      return deal.fechaSolicitud;
    case "montoAprobado":
      return deal.montoAprobado;
    case "estatusKyc":
      return deal.estatusKyc;
    case "cotizacion":
      // Uploaded sorts after pending either way; within that, by date.
      return deal.cotizacionEstatus === "completado"
        ? `1_${deal.cotizacionFechaEntregaAcordada ?? ""}`
        : null;
    case "creditoLiberadoFecha":
      return deal.creditoLiberadoFecha;
    case "disposicionCreditoFecha":
      return deal.disposicionCreditoFecha;
    case "comprobante":
      return deal.comprobanteEntregaEstatus === "completado"
        ? `1_${deal.comprobanteFechaEntrega ?? ""}`
        : null;
    case "desembolsoFecha":
      return deal.desembolsoFecha;
  }
}

/**
 * Sorted copy of `deals`. Nulls (pendiente, sin fecha) always sink to the
 * bottom regardless of direction — a store sorting dates "de mayor a
 * menor" wants the most recent first, not a pile of blanks up top because
 * they compared low.
 */
export function ordenarDeals(
  deals: PayDeskDeal[],
  sort: SortState | null,
  concesionarioNombres: Record<string, string> = {},
): PayDeskDeal[] {
  if (!sort) return deals;
  const signo = sort.dir === "asc" ? 1 : -1;

  return [...deals].sort((a, b) => {
    const va = valorDe(a, sort.key, concesionarioNombres);
    const vb = valorDe(b, sort.key, concesionarioNombres);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * signo;
    if (va > vb) return 1 * signo;
    return 0;
  });
}
