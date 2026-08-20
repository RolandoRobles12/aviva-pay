import type { PayDeskDeal } from "../types/deal";
import { estaCompleta, requiereAccion, scopeOf } from "../lib/dealScope";

export type FiltroEstado =
  | "todas"
  | "requieren-accion"
  | "en-proceso"
  | "completadas"
  | "historicas";

export type FiltroPeriodo = "todo" | "mes" | "trimestre" | "anio";

export interface Filtros {
  estado: FiltroEstado;
  periodo: FiltroPeriodo;
  busqueda: string;
}

export const FILTROS_INICIALES: Filtros = {
  estado: "todas",
  periodo: "todo",
  busqueda: "",
};

const ESTADOS: Array<{ id: FiltroEstado; label: string; hint: string }> = [
  { id: "todas", label: "Todas", hint: "Todas las solicitudes" },
  {
    id: "requieren-accion",
    label: "Te toca a ti",
    hint: "Falta que subas cotización o comprobante",
  },
  {
    id: "en-proceso",
    label: "En proceso",
    hint: "Avanzando — no requieren nada de tu parte ahora",
  },
  { id: "completadas", label: "Completadas", hint: "Ya llegaron al desembolso" },
  {
    id: "historicas",
    label: "Anteriores",
    hint: "Cerraron antes de que tu tienda empezara a usar Pay Desk",
  },
];

const PERIODOS: Array<{ id: FiltroPeriodo; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "mes", label: "Este mes" },
  { id: "trimestre", label: "3 meses" },
  { id: "anio", label: "Este año" },
];

/** Earliest approval date a deal can have and still match the period filter. */
function desdeDelPeriodo(periodo: FiltroPeriodo): Date | null {
  const ahora = new Date();
  switch (periodo) {
    case "mes":
      return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    case "trimestre":
      return new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1);
    case "anio":
      return new Date(ahora.getFullYear(), 0, 1);
    default:
      return null;
  }
}

/** Applies all three filters. Exported so the summary can report on the same subset the table shows. */
export function aplicarFiltros(
  deals: PayDeskDeal[],
  filtros: Filtros,
  rolloutDesde: string | null,
): PayDeskDeal[] {
  const desde = desdeDelPeriodo(filtros.periodo);
  const q = filtros.busqueda.trim().toLowerCase();

  return deals.filter((deal) => {
    if (q && !(deal.cliente ?? "").toLowerCase().includes(q)) return false;

    if (desde && deal.fechaSolicitud) {
      if (new Date(deal.fechaSolicitud) < desde) return false;
    }

    switch (filtros.estado) {
      case "requieren-accion":
        return requiereAccion(deal, rolloutDesde);
      case "completadas":
        return estaCompleta(deal);
      case "historicas":
        return scopeOf(deal, rolloutDesde) === "historica";
      case "en-proceso":
        return (
          scopeOf(deal, rolloutDesde) === "activa" &&
          !estaCompleta(deal) &&
          !requiereAccion(deal, rolloutDesde)
        );
      default:
        return true;
    }
  });
}

/** Count per state chip, so each chip can show how many it would leave. */
function conteos(deals: PayDeskDeal[], rolloutDesde: string | null) {
  return {
    todas: deals.length,
    "requieren-accion": deals.filter((d) => requiereAccion(d, rolloutDesde)).length,
    completadas: deals.filter(estaCompleta).length,
    historicas: deals.filter((d) => scopeOf(d, rolloutDesde) === "historica").length,
    "en-proceso": deals.filter(
      (d) =>
        scopeOf(d, rolloutDesde) === "activa" &&
        !estaCompleta(d) &&
        !requiereAccion(d, rolloutDesde),
    ).length,
  } satisfies Record<FiltroEstado, number>;
}

/**
 * One row of chips per axis, plus the name search. Chips rather than
 * dropdowns on purpose: every option is visible without opening anything,
 * each carries its own count, and one tap switches the view — which is
 * what a store on a phone at the counter needs.
 */
export function DealFilters({
  deals,
  filtros,
  rolloutDesde,
  onChange,
}: {
  deals: PayDeskDeal[];
  filtros: Filtros;
  rolloutDesde: string | null;
  onChange: (f: Filtros) => void;
}) {
  const n = conteos(deals, rolloutDesde);

  return (
    <div className="filters">
      <div className="filters__row" role="group" aria-label="Filtrar por estado">
        {ESTADOS.map((e) => (
          <button
            key={e.id}
            type="button"
            title={e.hint}
            aria-pressed={filtros.estado === e.id}
            className={`chip${filtros.estado === e.id ? " chip--on" : ""}${
              e.id === "requieren-accion" && n[e.id] > 0 ? " chip--accion" : ""
            }`}
            onClick={() => onChange({ ...filtros, estado: e.id })}
          >
            {e.label}
            <span className="chip__count">{n[e.id]}</span>
          </button>
        ))}
      </div>

      <div className="filters__row filters__row--secondary">
        <div role="group" aria-label="Filtrar por periodo" className="filters__group">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={filtros.periodo === p.id}
              className={`chip chip--sm${filtros.periodo === p.id ? " chip--on" : ""}`}
              onClick={() => onChange({ ...filtros, periodo: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="admin-search"
          placeholder="Buscar cliente por nombre"
          value={filtros.busqueda}
          onChange={(e) => onChange({ ...filtros, busqueda: e.target.value })}
        />

        {(filtros.estado !== "todas" ||
          filtros.periodo !== "todo" ||
          filtros.busqueda.trim()) && (
          <button
            type="button"
            className="link-button"
            onClick={() => onChange({ ...FILTROS_INICIALES })}
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
