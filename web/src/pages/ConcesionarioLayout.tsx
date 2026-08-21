import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, getConcesionarioDealsCallable, logout } from "../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import type { RolloutMap } from "../lib/dealScope";
import { BrandMark } from "../components/BrandMark";
import {
  FILTROS_INICIALES,
  aplicarFiltros,
  type Filtros,
} from "../components/DealFilters";

// Firestore's `in` operator caps at 30 values per query — a signed-in
// user's store list should never get near that, but chunking here mirrors
// the same cap the backend already works around in
// dealsRepository.ts#getDealsByConcesionarioIds.
const IN_CHUNK = 30;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      concesionarios: PayDeskConcesionario[];
      deals: PayDeskDeal[];
      labels: FieldLabels;
      /** Rollout cutoff per store; see dealScope.ts. */
      rolloutPorTienda: RolloutMap;
    };

export interface ConcesionarioContext {
  /** Every store this account can see. */
  concesionarios: PayDeskConcesionario[];
  /** concesionarioId → nombre, for the "Tienda" column and its sort. */
  concesionarioNombres: Record<string, string>;
  /** Everything across every store, unfiltered — the filter chips need the full set to count against. */
  deals: PayDeskDeal[];
  /** What the current filters leave. Both the list and the report read this, so any slice can be reported on. */
  dealsFiltrados: PayDeskDeal[];
  labels: FieldLabels;
  rolloutPorTienda: RolloutMap;
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
}

export function useConcesionario() {
  return useOutletContext<ConcesionarioContext>();
}

/**
 * Loads every store this account has access to and hands them to whichever
 * child route is showing, as one combined list — see the "multi-store UX"
 * decision this was built around. Filter state lives here too, so
 * switching between the list and the report keeps the slice the store had
 * picked instead of resetting it.
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
        const { concesionarios, deals, labels, rolloutPorTienda } = result.data;
        if (cancelled) return;

        setState({ status: "ready", concesionarios, deals, labels, rolloutPorTienda });

        // Realtime updates: the session's custom claim is what makes this
        // query pass the Firestore rules, and it only ever matches deals
        // from stores this account has access to.
        const ids = concesionarios.map((c) => c.concesionarioId);
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += IN_CHUNK) {
          chunks.push(ids.slice(i, i + IN_CHUNK));
        }

        const porChunk = new Map<number, PayDeskDeal[]>();
        const unsubs = chunks.map((chunk, i) =>
          onSnapshot(
            query(collection(db, "paydesk_deals"), where("concesionarioId", "in", chunk)),
            (snap) => {
              porChunk.set(i, snap.docs.map((doc) => doc.data() as PayDeskDeal));
              setState({
                status: "ready",
                concesionarios,
                labels,
                rolloutPorTienda,
                deals: chunks.flatMap((_, j) => porChunk.get(j) ?? []),
              });
            },
          ),
        );
        unsubscribe = () => unsubs.forEach((u) => u());
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

  const concesionarios = state.status === "ready" ? state.concesionarios : [];
  const deals = state.status === "ready" ? state.deals : [];
  const rolloutPorTienda = state.status === "ready" ? state.rolloutPorTienda : {};

  const concesionarioNombres = useMemo(
    () => Object.fromEntries(concesionarios.map((c) => [c.concesionarioId, c.nombre])),
    [concesionarios],
  );

  const dealsFiltrados = useMemo(
    () => aplicarFiltros(deals, filtros, rolloutPorTienda),
    [deals, filtros, rolloutPorTienda],
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
    concesionarios: state.concesionarios,
    concesionarioNombres,
    deals: state.deals,
    dealsFiltrados,
    labels: state.labels,
    rolloutPorTienda: state.rolloutPorTienda,
    filtros,
    setFiltros,
  };

  return (
    <main className="app-shell">
      <header className="app-bar">
        <BrandMark />
        <div className="header-right">
          <div className="store-badge">
            {state.concesionarios.length === 1 ? (
              <>
                <span className="store-badge__nombre">{state.concesionarios[0].nombre}</span>
                {state.concesionarios[0].numero && (
                  <span className="store-badge__numero">
                    Tienda {state.concesionarios[0].numero}
                  </span>
                )}
              </>
            ) : (
              <span
                className="store-badge__nombre"
                title={state.concesionarios.map((c) => c.nombre).join(", ")}
              >
                {state.concesionarios.length} tiendas
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
