import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  accesoDeSesion,
  auth,
  db,
  getConcesionarioDealsCallable,
  guardarCapacitacionCallable,
  logout,
  type CapacitacionTienda,
  type OrigenDisposicion,
} from "../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import { setEtapas, type RolloutMap } from "../lib/dealScope";
import { BrandMark } from "../components/BrandMark";
import { SelectorTiendas } from "../components/SelectorTiendas";
import { BienvenidaCapacitacion } from "../capacitacion/BienvenidaCapacitacion";
import { calcularAvance } from "../capacitacion/progreso";
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
      origenDisposicion: OrigenDisposicion;
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
  /** De dónde sale la fecha de disposición; cambia lo que se le explica a la tienda mientras está pendiente. */
  origenDisposicion: OrigenDisposicion;
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  /** Avance de quien entró en la capacitación (pestaña "Aprende"); null con un backend anterior. */
  capacitacion: CapacitacionTienda | null;
  /** Anota una lección como pasada. Rechaza si no se pudo guardar. */
  marcarLeccion: (id: string) => Promise<void>;
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
  // Aparte de `state` porque el listener de deals reescribe `state` en cada
  // cambio y no debe pisar una lección recién pasada.
  const [capacitacion, setCapacitacion] = useState<CapacitacionTienda | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        // `concesionarioIds` travels inside the ID token, which Firebase
        // caches for up to an hour. Without forcing a refresh, a store an
        // admin just granted stays invisible until that expires — the
        // callable and the Firestore rules both read the stale claim — and
        // signing out was the only way to see it. Forcing it here makes a
        // plain page reload enough.
        await auth.currentUser?.getIdToken(true);

        // Un vendedor externo no tiene lista de tienda: su vista es otra.
        if (auth.currentUser) {
          const acceso = await accesoDeSesion(auth.currentUser);
          if (cancelled) return;
          if (!acceso.tienda && acceso.vendedor) {
            navigate("/consulta", { replace: true });
            return;
          }
        }

        const result = await getConcesionarioDealsCallable();
        const { concesionarios, deals, labels, etapas, rolloutPorTienda, origenDisposicion } =
          result.data;
        if (cancelled) return;
        setEtapas(etapas);
        setCapacitacion(result.data.capacitacion ?? null);

        setState({
          status: "ready",
          concesionarios,
          deals,
          labels,
          rolloutPorTienda,
          origenDisposicion,
        });

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
                origenDisposicion,
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

  const marcarLeccion = useCallback(async (id: string) => {
    // Se ve completada al instante; si el servidor falla, la lección avisa
    // y ofrece reintentar, y el siguiente ingreso trae el dato real.
    setCapacitacion((c) =>
      c && !c.completadas.includes(id) ? { ...c, completadas: [...c.completadas, id] } : c,
    );
    const { data } = await guardarCapacitacionCallable({ leccion: id });
    setCapacitacion(data);
  }, []);

  const cerrarBienvenida = useCallback(() => {
    setCapacitacion((c) => (c ? { ...c, bienvenidaVista: true } : c));
    // Si no se guarda, a lo más se le vuelve a ofrecer en el siguiente
    // ingreso: no vale la pena interrumpirlo con un error.
    guardarCapacitacionCallable({ bienvenidaVista: true }).catch(() => {});
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
    origenDisposicion: state.origenDisposicion,
    filtros,
    setFiltros,
    capacitacion,
    marcarLeccion,
  };

  const avanceCapacitacion = capacitacion ? calcularAvance(capacitacion.completadas) : null;
  // Solo a quien nunca la ha visto ni ha empezado: es una invitación, no un muro.
  const mostrarBienvenida =
    capacitacion !== null && !capacitacion.bienvenidaVista && capacitacion.completadas.length === 0;

  return (
    <main className="app-shell">
      <header className="app-bar">
        <BrandMark />
        <div className="header-right">
          {state.concesionarios.length === 1 ? (
            <div className="store-badge">
              <span className="store-badge__nombre">{state.concesionarios[0].nombre}</span>
            </div>
          ) : (
            <SelectorTiendas
              concesionarios={state.concesionarios}
              deals={state.deals}
              seleccion={filtros.tienda}
              onSeleccion={(tienda) => setFiltros({ ...filtros, tienda })}
            />
          )}
          <button type="button" className="link-button" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/solicitudes" end>
          Mis clientes
        </NavLink>
        <NavLink to="/solicitudes/validar">Validar código</NavLink>
        <NavLink to="/solicitudes/canceladas">Canceladas</NavLink>
        <NavLink to="/solicitudes/reporte">Reporte</NavLink>
        <NavLink to="/solicitudes/aprende" className="tabs__aprende">
          Aprende
          {avanceCapacitacion && !avanceCapacitacion.completa && (
            <span
              className="tabs__pill"
              title={`${avanceCapacitacion.hechas} de ${avanceCapacitacion.total} lecciones completadas`}
            >
              {avanceCapacitacion.hechas}/{avanceCapacitacion.total}
            </span>
          )}
        </NavLink>
      </nav>

      <div className="app-body">
        <Outlet context={context} />
      </div>

      {mostrarBienvenida && <BienvenidaCapacitacion onCerrar={cerrarBienvenida} />}
    </main>
  );
}
