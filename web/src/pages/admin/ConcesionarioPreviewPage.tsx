import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { adminGetConcesionarioDealsCallable, type OrigenDisposicion } from "../../lib/firebase";
import { adminUploadCotizacion, adminUploadComprobante } from "../../lib/uploads";
import type { PayDeskConcesionario, PayDeskDeal } from "../../types/deal";
import type { FieldLabels } from "../../types/admin";
import { setEtapas } from "../../lib/dealScope";
import { Cargando, Notice, PageHeader } from "../../components/admin/ui";
import { DealsTable } from "../../components/DealsTable";
import { Paginacion, POR_PAGINA } from "../../components/Paginacion";
import { Modal } from "../../components/Modal";
import { CotizacionUploadForm } from "../../components/CotizacionUploadForm";
import { ComprobanteUploadForm } from "../../components/ComprobanteUploadForm";
import { ordenarDeals, type SortKey, type SortState } from "../../lib/dealSort";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      concesionario: PayDeskConcesionario;
      deals: PayDeskDeal[];
      labels: FieldLabels;
      rolloutDesde: string | null;
      origenDisposicion: OrigenDisposicion;
    };

type ActiveModal =
  | { type: "cotizacion"; dealId: string }
  | { type: "comprobante"; dealId: string }
  | null;

/**
 * What a store sees, viewed by an admin. Read-only for everything except
 * the cotización/comprobante files: an admin can view them and, if a
 * store uploaded the wrong one, replace it on their behalf (adminUpload*
 * — a separate endpoint from the store's own, gated on the `admin` claim
 * instead of a concesionarioIds match).
 */
export function ConcesionarioPreviewPage() {
  const { concesionarioId } = useParams<{ concesionarioId: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
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

  async function fetchEstado(): Promise<Extract<LoadState, { status: "ready" }>> {
    const result = await adminGetConcesionarioDealsCallable({
      concesionarioId: concesionarioId!,
    });
    setEtapas(result.data.etapas);
    return {
      status: "ready",
      concesionario: result.data.concesionario,
      deals: result.data.deals,
      labels: result.data.labels,
      rolloutDesde: result.data.rolloutDesde,
      origenDisposicion: result.data.origenDisposicion,
    };
  }

  /** Re-fetches after an admin replaces a file, so the table reflects it without a page reload. */
  async function recargar() {
    if (!concesionarioId) return;
    setState(await fetchEstado());
  }

  useEffect(() => {
    if (!concesionarioId) return;
    let cancelled = false;

    (async () => {
      try {
        const next = await fetchEstado();
        if (!cancelled) setState(next);
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "No se pudieron cargar las solicitudes.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [concesionarioId]);

  if (state.status === "loading") {
    return (
      <>
        <PageHeader titulo="Tienda" volver={{ to: "/admin/tiendas", label: "Tiendas" }} />
        <Cargando texto="Cargando solicitudes..." />
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <PageHeader titulo="Tienda" volver={{ to: "/admin/tiendas", label: "Tiendas" }} />
        <Notice tono="error">{state.message}</Notice>
      </>
    );
  }

  const deals = state.deals;

  return (
    <section>
      <PageHeader
        volver={{ to: "/admin/tiendas", label: "Tiendas" }}
        titulo={state.concesionario.nombre}
        descripcion="Así ve esta tienda sus solicitudes. Puedes abrir sus documentos y reemplazar uno si la tienda subió el equivocado. La etiqueta bajo cada documento dice qué encontró la verificación automática."
      />

      <DealsTable
        mostrarVerificacion
        deals={ordenarDeals(deals, sort).slice(
          pagina * POR_PAGINA,
          (pagina + 1) * POR_PAGINA,
        )}
        labels={state.labels}
        rolloutPorTienda={{ [state.concesionario.concesionarioId]: state.rolloutDesde }}
        origenDisposicion={state.origenDisposicion}
        sort={sort}
        onSort={handleSort}
        onUploadCotizacion={(dealId) => setActiveModal({ type: "cotizacion", dealId })}
        onUploadComprobante={(dealId) => setActiveModal({ type: "comprobante", dealId })}
      />
      <Paginacion total={deals.length} pagina={pagina} onPagina={setPagina} />

      {activeModal?.type === "cotizacion" && (
        <Modal onClose={() => setActiveModal(null)}>
          <CotizacionUploadForm
            dealId={activeModal.dealId}
            labels={state.labels}
            reemplazo={(() => {
              const d = deals.find((x) => x.dealId === activeModal.dealId);
              return Boolean(d?.cotizacionPath || d?.cotizacionUrl);
            })()}
            onUpload={adminUploadCotizacion}
            onUploaded={async () => {
              setActiveModal(null);
              await recargar();
            }}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {activeModal?.type === "comprobante" && (
        <Modal onClose={() => setActiveModal(null)}>
          <ComprobanteUploadForm
            dealId={activeModal.dealId}
            labels={state.labels}
            reemplazo={(() => {
              const d = deals.find((x) => x.dealId === activeModal.dealId);
              return Boolean(d?.comprobantePath || d?.comprobanteUrl);
            })()}
            onUpload={adminUploadComprobante}
            onUploaded={async () => {
              setActiveModal(null);
              await recargar();
            }}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
    </section>
  );
}
