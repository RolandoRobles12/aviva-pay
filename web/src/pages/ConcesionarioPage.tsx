import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, getConcesionarioDealsCallable, logout } from "../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import { DealsTable } from "../components/DealsTable";
import { DealsSummary } from "../components/DealsSummary";
import {
  DealFilters,
  FILTROS_INICIALES,
  aplicarFiltros,
  type Filtros,
} from "../components/DealFilters";
import { StatTiles } from "../components/StatTiles";
import { requiereAccion, scopeOf } from "../lib/dealScope";
import { Modal } from "../components/Modal";
import { CotizacionUploadForm } from "../components/CotizacionUploadForm";
import { ComprobanteUploadForm } from "../components/ComprobanteUploadForm";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      concesionario: PayDeskConcesionario;
      deals: PayDeskDeal[];
      labels: FieldLabels;
      /** This store's rollout cutoff; null while the rollout date is undecided. */
      rolloutDesde: string | null;
    };

type ActiveModal =
  | { type: "cotizacion"; dealId: string }
  | { type: "comprobante"; dealId: string }
  | null;

export function ConcesionarioPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const result = await getConcesionarioDealsCallable();
        const { concesionario, deals, labels, rolloutDesde } = result.data;
        if (cancelled) return;

        setState({ status: "ready", concesionario, deals, labels, rolloutDesde });

        // Realtime updates: the session's custom claim is what makes this
        // query pass the Firestore rules, and it only ever matches this
        // store's own deals.
        const dealsQuery = query(
          collection(db, "paydesk_deals"),
          where("concesionarioId", "==", concesionario.concesionarioId),
        );
        unsubscribe = onSnapshot(dealsQuery, (snap) => {
          setState({
            status: "ready",
            concesionario,
            labels,
            rolloutDesde,
            deals: snap.docs.map((doc) => doc.data() as PayDeskDeal),
          });
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "No pudimos cargar tus solicitudes.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  // Hooks can't sit behind the early returns below, so these read from the
  // union's "ready" branch defensively rather than after narrowing it.
  const deals = state.status === "ready" ? state.deals : [];
  const rolloutDesde = state.status === "ready" ? state.rolloutDesde : null;

  /**
   * The KPI row counts only deals in scope. A store that joined last month
   * shouldn't open the page to "47 cotizaciones por subir" for sales that
   * closed in 2025 — those are done, and nothing about them is actionable.
   */
  const resumen = useMemo(() => {
    const activos = deals.filter((d) => scopeOf(d, rolloutDesde) === "activa");
    return {
      activos: activos.length,
      historicos: deals.length - activos.length,
      pendientesCotizacion: activos.filter(
        (d) => d.cotizacionEstatus === "pendiente",
      ).length,
      pendientesComprobante: activos.filter(
        (d) => d.comprobanteEntregaEstatus === "pendiente",
      ).length,
      porHacer: deals.filter((d) => requiereAccion(d, rolloutDesde)).length,
      montoTotal: deals.reduce((sum, d) => sum + (d.montoAprobado ?? 0), 0),
    };
  }, [deals, rolloutDesde]);

  const dealsFiltrados = useMemo(
    () => aplicarFiltros(deals, filtros, rolloutDesde),
    [deals, filtros, rolloutDesde],
  );

  if (state.status === "loading") {
    return <p className="page-message">Cargando solicitudes...</p>;
  }

  if (state.status === "error") {
    return (
      <div className="page-message page-message--error">
        <p>{state.message}</p>
        <button type="button" className="link-button" onClick={handleLogout}>
          Volver a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <main className="concesionario-page">
      <header className="concesionario-page__header">
        <div className="brand-mark">
          <span className="brand-mark__aviva">Aviva</span>
          <span className="brand-mark__product">Pay Desk</span>
        </div>
        <div className="header-right">
          <div className="store-badge">
            <span className="store-badge__nombre">{state.concesionario.nombre}</span>
            {state.concesionario.numero && (
              <span className="store-badge__numero">
                Tienda {state.concesionario.numero}
              </span>
            )}
          </div>
          <button type="button" className="link-button" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>

      <h1 className="concesionario-page__title">Solicitudes de tus clientes</h1>
      <p className="concesionario-page__subtitle">
        Consulta el avance de cada crédito y sube la cotización y el
        comprobante de entrega cuando corresponda.
      </p>

      {/* The one thing worth interrupting for: what's waiting on the store
          right now. One tap filters the table down to exactly those. */}
      {resumen.porHacer > 0 && (
        <button
          type="button"
          className="callout-accion"
          onClick={() => setFiltros({ ...filtros, estado: "requieren-accion" })}
        >
          <span className="callout-accion__count">{resumen.porHacer}</span>
          <span>
            {resumen.porHacer === 1
              ? "cliente está esperando un documento tuyo"
              : "clientes están esperando un documento tuyo"}
            <span className="callout-accion__cta">Ver cuáles →</span>
          </span>
        </button>
      )}

      <StatTiles
        stats={[
          {
            label: "Solicitudes",
            value: state.deals.length.toLocaleString("es-MX"),
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

      {state.deals.length > 0 && (
        <>
          <DealFilters
            deals={state.deals}
            filtros={filtros}
            rolloutDesde={rolloutDesde}
            onChange={setFiltros}
          />
          <DealsSummary deals={dealsFiltrados} />
        </>
      )}

      <DealsTable
        deals={dealsFiltrados}
        labels={state.labels}
        rolloutDesde={rolloutDesde}
        onUploadCotizacion={(dealId) => setActiveModal({ type: "cotizacion", dealId })}
        onUploadComprobante={(dealId) => setActiveModal({ type: "comprobante", dealId })}
      />

      {activeModal?.type === "cotizacion" && (
        <Modal onClose={() => setActiveModal(null)}>
          <CotizacionUploadForm
            dealId={activeModal.dealId}
            labels={state.labels}
            onUploaded={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {activeModal?.type === "comprobante" && (
        <Modal onClose={() => setActiveModal(null)}>
          <ComprobanteUploadForm
            dealId={activeModal.dealId}
            labels={state.labels}
            onUploaded={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
    </main>
  );
}
