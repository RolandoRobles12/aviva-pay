import { useMemo } from "react";
import { useConcesionario } from "./ConcesionarioLayout";
import { DealFilters } from "../components/DealFilters";
import { DealsSummary } from "../components/DealsSummary";
import { StatTiles } from "../components/StatTiles";
import { scopeOf } from "../lib/dealScope";

/**
 * Everything analytical, kept off the client list so that page stays a
 * list. Runs on the same filter state the list uses, so a store can filter
 * to a period there and switch here to see that period's numbers.
 */
export function ReportePage() {
  const { deals, dealsFiltrados, rolloutDesde, filtros, setFiltros } =
    useConcesionario();

  // Pending counts skip historical deals: a sale that closed before this
  // store started on Pay Desk has no document left to upload, so counting
  // it would report work that doesn't exist.
  const resumen = useMemo(() => {
    const activos = dealsFiltrados.filter(
      (d) => scopeOf(d, rolloutDesde) === "activa",
    );
    return {
      pendientesCotizacion: activos.filter(
        (d) => d.cotizacionEstatus === "pendiente",
      ).length,
      pendientesComprobante: activos.filter(
        (d) => d.comprobanteEntregaEstatus === "pendiente",
      ).length,
      montoTotal: dealsFiltrados.reduce((s, d) => s + (d.montoAprobado ?? 0), 0),
    };
  }, [dealsFiltrados, rolloutDesde]);

  return (
    <>
      <h1 className="concesionario-page__title">Reporte</h1>
      <p className="concesionario-page__subtitle">
        Cómo van los créditos de tus clientes. Los números siguen el filtro que
        elijas.
      </p>

      {deals.length > 0 && (
        <DealFilters
          deals={deals}
          filtros={filtros}
          rolloutDesde={rolloutDesde}
          onChange={setFiltros}
        />
      )}

      <StatTiles
        stats={[
          {
            label: "Solicitudes",
            value: dealsFiltrados.length.toLocaleString("es-MX"),
          },
          {
            label: "Cotización por subir",
            value: resumen.pendientesCotizacion.toLocaleString("es-MX"),
            tone: resumen.pendientesCotizacion > 0 ? "accion" : "neutral",
          },
          {
            label: "Comprobante por subir",
            value: resumen.pendientesComprobante.toLocaleString("es-MX"),
            tone: resumen.pendientesComprobante > 0 ? "accion" : "neutral",
          },
          {
            label: "Monto aprobado",
            value: resumen.montoTotal.toLocaleString("es-MX", {
              style: "currency",
              currency: "MXN",
              maximumFractionDigits: 0,
            }),
          },
        ]}
      />

      {dealsFiltrados.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden>
            📊
          </span>
          <p className="empty-state__title">Nada que reportar todavía</p>
          <p className="empty-state__hint">
            No hay solicitudes que coincidan con el filtro. Prueba con otro
            periodo o quita los filtros.
          </p>
        </div>
      ) : (
        <DealsSummary deals={dealsFiltrados} />
      )}
    </>
  );
}
