import { useEffect, useMemo, useState } from "react";
import { useConcesionario } from "./ConcesionarioLayout";
import { DealsTable } from "../components/DealsTable";
import { DealFilters } from "../components/DealFilters";
import { Paginacion, POR_PAGINA } from "../components/Paginacion";
import { Modal } from "../components/Modal";
import { CotizacionUploadForm } from "../components/CotizacionUploadForm";
import { ComprobanteUploadForm } from "../components/ComprobanteUploadForm";
import { requiereAccion } from "../lib/dealScope";
import { ordenarDeals, type SortKey, type SortState } from "../lib/dealSort";

type ActiveModal =
  | { type: "cotizacion"; dealId: string }
  | { type: "comprobante"; dealId: string }
  | null;

/**
 * The store's home: their client list and nothing else competing with it.
 * The only thing allowed above the table is the one line telling them
 * something is waiting on them — everything analytical lives on the
 * Reporte tab.
 */
export function SolicitudesPage() {
  const {
    deals,
    dealsFiltrados,
    labels,
    rolloutPorTienda,
    concesionarioNombres,
    filtros,
    setFiltros,
  } = useConcesionario();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [pagina, setPagina] = useState(0);
  const [sort, setSort] = useState<SortState | null>({
    key: "fechaSolicitud",
    dir: "desc",
  });

  function handleSort(key: SortKey) {
    setSort((actual) =>
      actual?.key === key
        ? { key, dir: actual.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }

  const porHacer = useMemo(
    () => deals.filter((d) => requiereAccion(d, rolloutPorTienda)).length,
    [deals, rolloutPorTienda],
  );

  // A filter change can leave the current page past the end of the new
  // result set, which would render an empty table on a non-empty result.
  useEffect(() => {
    setPagina(0);
  }, [filtros]);

  const ordenados = useMemo(
    () => ordenarDeals(dealsFiltrados, sort, concesionarioNombres),
    [dealsFiltrados, sort, concesionarioNombres],
  );

  const visibles = ordenados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  return (
    <>
      {porHacer > 0 && (
        <button
          type="button"
          className="callout-accion"
          onClick={() => setFiltros({ ...filtros, estado: "requieren-accion" })}
        >
          <span className="callout-accion__count">{porHacer}</span>
          <span>
            {porHacer === 1
              ? "cliente está esperando un documento tuyo"
              : "clientes están esperando un documento tuyo"}
            <span className="callout-accion__cta">Ver cuáles →</span>
          </span>
        </button>
      )}

      {deals.length > 0 && (
        <DealFilters
          deals={deals}
          filtros={filtros}
          rolloutPorTienda={rolloutPorTienda}
          onChange={setFiltros}
        />
      )}

      {dealsFiltrados.length === 0 && deals.length > 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden>
            🔍
          </span>
          <p className="empty-state__title">Nada en este periodo</p>
          <p className="empty-state__hint">
            Tienes {deals.length.toLocaleString("es-MX")}{" "}
            {deals.length === 1 ? "solicitud" : "solicitudes"} en total, pero
            ninguna coincide con el filtro de arriba.
          </p>
          <button
            type="button"
            className="upload-button"
            onClick={() => setFiltros({ ...filtros, periodo: "todo" })}
          >
            Ver todo
          </button>
        </div>
      ) : (
        <>
          <DealsTable
            deals={visibles}
            labels={labels}
            rolloutPorTienda={rolloutPorTienda}
            concesionarioNombres={concesionarioNombres}
            sort={sort}
            onSort={handleSort}
            onUploadCotizacion={(dealId) => setActiveModal({ type: "cotizacion", dealId })}
            onUploadComprobante={(dealId) => setActiveModal({ type: "comprobante", dealId })}
          />
          <Paginacion
            total={dealsFiltrados.length}
            pagina={pagina}
            onPagina={setPagina}
          />
        </>
      )}

      {activeModal?.type === "cotizacion" && (
        <Modal onClose={() => setActiveModal(null)}>
          <CotizacionUploadForm
            dealId={activeModal.dealId}
            labels={labels}
            onUploaded={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {activeModal?.type === "comprobante" && (
        <Modal onClose={() => setActiveModal(null)}>
          <ComprobanteUploadForm
            dealId={activeModal.dealId}
            labels={labels}
            onUploaded={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
    </>
  );
}
