import type { PayDeskDeal } from "../types/deal";
import { estaCompleta, requiereAccion, scopeOf, type RolloutMap } from "../lib/dealScope";

export type FiltroEstado =
  | "todas"
  | "requieren-accion"
  | "en-proceso"
  | "completadas"
  | "historicas";

export type FiltroPeriodo =
  | "hoy"
  | "semana"
  | "mes"
  | "mes-pasado"
  | "anio"
  | "todo"
  | "personalizado";

export interface Filtros {
  estado: FiltroEstado;
  periodo: FiltroPeriodo;
  /** A concesionarioId, or "todas". Only meaningful for accounts with more than one store. */
  tienda: string;
  /** Only read when periodo === "personalizado". ISO dates (YYYY-MM-DD), either side optional. */
  desde: string;
  hasta: string;
  busqueda: string;
}

export const TODAS_LAS_TIENDAS = "todas";

/**
 * Opens on the current month: a store's working set is what came in
 * recently, not everything it has ever sold. "Todo" is one tap away, and
 * the empty state links straight to it when the month happens to be
 * quiet.
 */
export const FILTROS_INICIALES: Filtros = {
  estado: "todas",
  periodo: "mes",
  tienda: TODAS_LAS_TIENDAS,
  desde: "",
  hasta: "",
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
    hint: "Cerraron antes de que tu tienda empezara a usar Paydesk",
  },
];

const PERIODOS: Array<{ id: FiltroPeriodo; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "mes-pasado", label: "Mes pasado" },
  { id: "anio", label: "Este año" },
  { id: "todo", label: "Todo" },
  { id: "personalizado", label: "Personalizado" },
];

/** Local YYYY-MM-DD. `toISOString()` would convert to UTC first and shift the day for anyone west of Greenwich. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Inclusive YYYY-MM-DD bounds for a period, either side optional.
 *
 * Bounds are strings, and deals are compared as strings too: the values
 * come from date pickers and calendar boundaries with no time of day, so
 * parsing them into Dates would put them at local midnight and drop deals
 * approved later that same day.
 */
export function rangoDelPeriodo(filtros: Filtros): {
  desde: string | null;
  hasta: string | null;
} {
  const hoy = new Date();
  const a = hoy.getFullYear();
  const m = hoy.getMonth();

  switch (filtros.periodo) {
    case "hoy":
      return { desde: iso(hoy), hasta: iso(hoy) };
    case "semana": {
      // Week starts Monday, as it does in Mexico.
      const diaSemana = (hoy.getDay() + 6) % 7;
      const lunes = new Date(a, m, hoy.getDate() - diaSemana);
      return { desde: iso(lunes), hasta: iso(hoy) };
    }
    case "mes":
      return { desde: iso(new Date(a, m, 1)), hasta: iso(new Date(a, m + 1, 0)) };
    case "mes-pasado":
      return { desde: iso(new Date(a, m - 1, 1)), hasta: iso(new Date(a, m, 0)) };
    case "anio":
      return { desde: iso(new Date(a, 0, 1)), hasta: iso(new Date(a, 11, 31)) };
    case "personalizado":
      return { desde: filtros.desde || null, hasta: filtros.hasta || null };
    default:
      return { desde: null, hasta: null };
  }
}

/** Applies every filter. Exported so the report can run on the same subset the table shows. */
export function aplicarFiltros(
  deals: PayDeskDeal[],
  filtros: Filtros,
  rolloutPorTienda: RolloutMap,
): PayDeskDeal[] {
  const { desde, hasta } = rangoDelPeriodo(filtros);
  const q = filtros.busqueda.trim().toLowerCase();

  return deals.filter((deal) => {
    if (filtros.tienda !== TODAS_LAS_TIENDAS && deal.concesionarioId !== filtros.tienda) {
      return false;
    }

    if (q && !(deal.cliente ?? "").toLowerCase().includes(q)) return false;

    if ((desde || hasta) && deal.fechaSolicitud) {
      const dia = deal.fechaSolicitud.slice(0, 10);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
    }

    switch (filtros.estado) {
      case "requieren-accion":
        return requiereAccion(deal, rolloutPorTienda);
      case "completadas":
        return estaCompleta(deal);
      case "historicas":
        return scopeOf(deal, rolloutPorTienda) === "historica";
      case "en-proceso":
        return (
          scopeOf(deal, rolloutPorTienda) === "activa" &&
          !estaCompleta(deal) &&
          !requiereAccion(deal, rolloutPorTienda)
        );
      default:
        return true;
    }
  });
}

/** Count per state chip, so each chip can show how many it would leave. */
function conteos(deals: PayDeskDeal[], rolloutPorTienda: RolloutMap) {
  return {
    todas: deals.length,
    "requieren-accion": deals.filter((d) => requiereAccion(d, rolloutPorTienda)).length,
    completadas: deals.filter(estaCompleta).length,
    historicas: deals.filter((d) => scopeOf(d, rolloutPorTienda) === "historica").length,
    "en-proceso": deals.filter(
      (d) =>
        scopeOf(d, rolloutPorTienda) === "activa" &&
        !estaCompleta(d) &&
        !requiereAccion(d, rolloutPorTienda),
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
  rolloutPorTienda,
  concesionarios = [],
  onChange,
}: {
  deals: PayDeskDeal[];
  filtros: Filtros;
  rolloutPorTienda: RolloutMap;
  /** Every store this account can see. The store row only earns its place once there's more than one. */
  concesionarios?: Array<{ concesionarioId: string; nombre: string }>;
  onChange: (f: Filtros) => void;
}) {
  const n = conteos(deals, rolloutPorTienda);
  const variasTiendas = concesionarios.length > 1;

  return (
    <div className="filters">
      {variasTiendas && (
        <div className="filters__row" role="group" aria-label="Filtrar por tienda">
          <button
            type="button"
            aria-pressed={filtros.tienda === TODAS_LAS_TIENDAS}
            className={`chip${filtros.tienda === TODAS_LAS_TIENDAS ? " chip--on" : ""}`}
            onClick={() => onChange({ ...filtros, tienda: TODAS_LAS_TIENDAS })}
          >
            Todas mis tiendas
            <span className="chip__count">{deals.length}</span>
          </button>
          {concesionarios.map((c) => (
            <button
              key={c.concesionarioId}
              type="button"
              aria-pressed={filtros.tienda === c.concesionarioId}
              className={`chip${filtros.tienda === c.concesionarioId ? " chip--on" : ""}`}
              onClick={() => onChange({ ...filtros, tienda: c.concesionarioId })}
            >
              {c.nombre}
              <span className="chip__count">
                {deals.filter((d) => d.concesionarioId === c.concesionarioId).length}
              </span>
            </button>
          ))}
        </div>
      )}

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

        {filtros.periodo === "personalizado" && (
          <span className="filters__rango">
            <input
              type="date"
              aria-label="Desde"
              value={filtros.desde}
              max={filtros.hasta || undefined}
              onChange={(e) => onChange({ ...filtros, desde: e.target.value })}
            />
            <span aria-hidden>–</span>
            <input
              type="date"
              aria-label="Hasta"
              value={filtros.hasta}
              min={filtros.desde || undefined}
              onChange={(e) => onChange({ ...filtros, hasta: e.target.value })}
            />
          </span>
        )}

        <input
          type="search"
          className="admin-search"
          placeholder="Buscar cliente por nombre"
          value={filtros.busqueda}
          onChange={(e) => onChange({ ...filtros, busqueda: e.target.value })}
        />

        {(filtros.estado !== FILTROS_INICIALES.estado ||
          filtros.periodo !== FILTROS_INICIALES.periodo ||
          filtros.tienda !== FILTROS_INICIALES.tienda ||
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
