import { useEffect, useRef, useState } from "react";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import { TODAS_LAS_TIENDAS } from "./DealFilters";

/**
 * The store chip in the app bar, for an account with more than one store.
 *
 * It reads as a label ("2 tiendas") but it's the natural place to look for
 * "which stores are mine?", so it opens into the actual list — and picking
 * one there sets the same store filter the chips use, rather than being a
 * second, competing notion of "current store".
 */
export function SelectorTiendas({
  concesionarios,
  deals,
  seleccion,
  onSeleccion,
}: {
  concesionarios: PayDeskConcesionario[];
  /** Everything unfiltered, for the per-store counts. */
  deals: PayDeskDeal[];
  /** A concesionarioId, or TODAS_LAS_TIENDAS. */
  seleccion: string;
  onSeleccion: (tienda: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function alClicFuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  const activa = concesionarios.find((c) => c.concesionarioId === seleccion);

  function elegir(tienda: string) {
    onSeleccion(tienda);
    setAbierto(false);
  }

  return (
    <div className="store-menu" ref={contenedor}>
      <button
        type="button"
        className="store-badge store-badge--boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="store-badge__nombre">
          {/* Says what you're looking at, not just how many you have — the
              label is the only place the filter is visible from the Reporte
              tab, where the chips are further down the page. */}
          {activa ? activa.nombre : `${concesionarios.length} tiendas`}
        </span>
        <span className="store-badge__numero">
          {activa ? "Viendo solo esta" : "Viendo todas"}
        </span>
        <span className="store-menu__flecha" aria-hidden>
          ▾
        </span>
      </button>

      {abierto && (
        <div className="store-menu__panel" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={seleccion === TODAS_LAS_TIENDAS}
            className={`store-menu__item${
              seleccion === TODAS_LAS_TIENDAS ? " store-menu__item--on" : ""
            }`}
            onClick={() => elegir(TODAS_LAS_TIENDAS)}
          >
            <span className="store-menu__check" aria-hidden>
              {seleccion === TODAS_LAS_TIENDAS ? "✓" : ""}
            </span>
            <span className="store-menu__texto">
              <strong>Todas mis tiendas</strong>
              <small>Los clientes de las {concesionarios.length} juntos</small>
            </span>
            <span className="store-menu__conteo">{deals.length}</span>
          </button>

          <div className="store-menu__sep" role="separator" />

          {concesionarios.map((c) => (
            <button
              key={c.concesionarioId}
              type="button"
              role="menuitemradio"
              aria-checked={seleccion === c.concesionarioId}
              className={`store-menu__item${
                seleccion === c.concesionarioId ? " store-menu__item--on" : ""
              }`}
              onClick={() => elegir(c.concesionarioId)}
            >
              <span className="store-menu__check" aria-hidden>
                {seleccion === c.concesionarioId ? "✓" : ""}
              </span>
              <span className="store-menu__texto">
                <strong>{c.nombre}</strong>
                {c.numero && <small>Tienda {c.numero}</small>}
              </span>
              <span className="store-menu__conteo">
                {deals.filter((d) => d.concesionarioId === c.concesionarioId).length}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
