import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, getConcesionarioDealsCallable, logout } from "../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import { BrandMark } from "../components/BrandMark";
import {
  FILTROS_INICIALES,
  aplicarFiltros,
  type Filtros,
} from "../components/DealFilters";

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

export interface ConcesionarioContext {
  /** Everything this store has, unfiltered — the filter chips need the full set to count against. */
  deals: PayDeskDeal[];
  /** What the current filters leave. Both the list and the report read this, so any slice can be reported on. */
  dealsFiltrados: PayDeskDeal[];
  labels: FieldLabels;
  rolloutDesde: string | null;
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
}

export function useConcesionario() {
  return useOutletContext<ConcesionarioContext>();
}

/**
 * Loads the store's deals once and hands them to whichever child route is
 * showing. Filter state lives here too, so switching between the list and
 * the report keeps the slice the store had picked instead of resetting it.
 */
export function ConcesionarioLayout() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
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

  const deals = state.status === "ready" ? state.deals : [];
  const rolloutDesde = state.status === "ready" ? state.rolloutDesde : null;

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

  const context: ConcesionarioContext = {
    deals: state.deals,
    dealsFiltrados,
    labels: state.labels,
    rolloutDesde: state.rolloutDesde,
    filtros,
    setFiltros,
  };

  return (
    <main className="app-shell">
      <header className="app-bar">
        <BrandMark />
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

      <nav className="tabs">
        <NavLink to="/solicitudes" end>
          Mis clientes
        </NavLink>
        <NavLink to="/solicitudes/reporte">Reporte</NavLink>
      </nav>

      <div className="app-body">
        <Outlet context={context} />
      </div>
    </main>
  );
}
