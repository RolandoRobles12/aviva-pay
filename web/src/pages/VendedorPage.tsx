import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  accesoDeSesion,
  auth,
  getVendedorClientesCallable,
  logout,
  type DealVendedor,
} from "../lib/firebase";
import type { PayDeskConcesionario } from "../types/deal";
import { completados, etapaActual, getEtapas, setEtapas } from "../lib/dealScope";
import { BrandMark } from "../components/BrandMark";
import { Paginacion, POR_PAGINA } from "../components/Paginacion";
import { Avance } from "../capacitacion/piezas";
import { normalizarBusqueda } from "../capacitacion/progreso";

/** Cada cuánto se vuelve a pedir la lista sola: no hay listener en vivo para el vendedor. */
const REFRESCO_MS = 5 * 60 * 1000;
const TODAS = "todas";

type Estado =
  | { status: "cargando" }
  | { status: "error"; mensaje: string }
  | {
      status: "listo";
      concesionarios: PayDeskConcesionario[];
      clientes: DealVendedor[];
      consultadoEn: string;
    };

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * La vista del vendedor externo: sus clientes aprobados y en qué etapa va
 * cada uno. Solo lectura de punta a punta: no hay botones de subir, ni
 * caja, ni archivos, y aunque alguien los invocara a mano, el servidor no
 * le da permiso (su cuenta trae `vendedorIds`, no `concesionarioIds`).
 *
 * Los datos llegan ya recortados por el servidor (nombre, fecha y etapas;
 * ver functions/src/vendedor/proyeccion.ts), así que lo que no se ve aquí
 * tampoco está en el navegador.
 */
export function VendedorPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>({ status: "cargando" });
  const [actualizando, setActualizando] = useState(false);
  const [tambienTienda, setTambienTienda] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [tienda, setTienda] = useState(TODAS);
  const [etapa, setEtapa] = useState(TODAS);
  const [pagina, setPagina] = useState(0);

  const cargar = useCallback(async () => {
    setActualizando(true);
    try {
      // Igual que en la tienda: sin forzar, una tienda recién asignada no
      // aparece hasta que el token vence (hasta una hora).
      await auth.currentUser?.getIdToken(true);
      if (auth.currentUser) setTambienTienda((await accesoDeSesion(auth.currentUser)).tienda);
      const { data } = await getVendedorClientesCallable();
      setEtapas(data.etapas);
      setEstado({
        status: "listo",
        concesionarios: data.concesionarios,
        clientes: data.clientes,
        consultadoEn: data.consultadoEn,
      });
    } catch (err) {
      setEstado((actual) =>
        // Si ya había lista, una recarga fallida no la borra.
        actual.status === "listo"
          ? actual
          : {
              status: "error",
              mensaje: err instanceof Error ? err.message : "No pudimos cargar tus clientes.",
            },
      );
    } finally {
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  useEffect(() => setPagina(0), [busqueda, tienda, etapa]);

  const clientes = estado.status === "listo" ? estado.clientes : [];
  const concesionarios = estado.status === "listo" ? estado.concesionarios : [];
  const nombres = useMemo(
    () => Object.fromEntries(concesionarios.map((c) => [c.concesionarioId, c.nombre])),
    [concesionarios],
  );

  // La etapa de cada cliente se calcula una vez; los chips y la tabla la comparten.
  const conEtapa = useMemo(
    () =>
      clientes
        .map((c) => ({ c, e: etapaActual(c) }))
        .sort((a, b) => (b.c.fechaSolicitud ?? "").localeCompare(a.c.fechaSolicitud ?? "")),
    // getEtapas() cambia con setEtapas, que ocurre junto con `clientes`.
    [clientes],
  );

  const deTienda = conEtapa.filter((x) => tienda === TODAS || x.c.concesionarioId === tienda);
  const q = normalizarBusqueda(busqueda);
  const visibles = deTienda.filter(
    (x) =>
      (etapa === TODAS || x.e.actual?.id === etapa) &&
      (!q || normalizarBusqueda(x.c.cliente ?? "").includes(q)),
  );
  const pag = visibles.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const etapas = getEtapas();
  const varias = concesionarios.length > 1;

  async function salir() {
    await logout();
    navigate("/", { replace: true });
  }

  if (estado.status === "cargando") {
    return <p className="page-message">Cargando tus clientes...</p>;
  }

  if (estado.status === "error") {
    return (
      <div className="page-message page-message--error">
        <p>{estado.mensaje}</p>
        <button type="button" className="link-button" onClick={salir}>
          Volver a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-bar">
        <BrandMark />
        <div className="header-right">
          <div className="store-badge">
            <span className="store-badge__nombre">
              {varias ? `${concesionarios.length} tiendas` : concesionarios[0]?.nombre ?? "Consulta"}
            </span>
            <span className="store-badge__numero">Vendedor externo · solo consulta</span>
          </div>
          <button type="button" className="link-button" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      {tambienTienda && (
        <nav className="tabs">
          <Link to="/solicitudes">Mis clientes</Link>
          <Link to="/consulta" className="active">
            Solo consulta
          </Link>
        </nav>
      )}

      <div className="app-body">
        <div className="vendedor-cabeza">
          <div>
            <h1 className="concesionario-page__title vendedor-cabeza__titulo">Clientes aprobados</h1>
            <p className="concesionario-page__subtitle">
              En qué etapa va cada cliente. Es una vista de consulta: los documentos y
              la caja los maneja la tienda.
            </p>
          </div>
          <div className="vendedor-cabeza__refresco">
            <button
              type="button"
              className="link-button"
              onClick={() => void cargar()}
              disabled={actualizando}
            >
              {actualizando ? "Actualizando..." : "Actualizar"}
            </button>
            <span className="form-note">
              Al{" "}
              {new Date(estado.consultadoEn).toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>

        <div className="filters">
          {varias && (
            <div className="filters__row" role="group" aria-label="Filtrar por tienda">
              <button
                type="button"
                aria-pressed={tienda === TODAS}
                className={`chip${tienda === TODAS ? " chip--on" : ""}`}
                onClick={() => setTienda(TODAS)}
              >
                Todas mis tiendas <span className="chip__count">{conEtapa.length}</span>
              </button>
              {concesionarios.map((c) => (
                <button
                  key={c.concesionarioId}
                  type="button"
                  aria-pressed={tienda === c.concesionarioId}
                  className={`chip${tienda === c.concesionarioId ? " chip--on" : ""}`}
                  onClick={() => setTienda(c.concesionarioId)}
                >
                  {c.nombre}{" "}
                  <span className="chip__count">
                    {conEtapa.filter((x) => x.c.concesionarioId === c.concesionarioId).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="filters__row" role="group" aria-label="Filtrar por etapa">
            <button
              type="button"
              aria-pressed={etapa === TODAS}
              className={`chip${etapa === TODAS ? " chip--on" : ""}`}
              onClick={() => setEtapa(TODAS)}
            >
              Todas las etapas <span className="chip__count">{deTienda.length}</span>
            </button>
            {etapas.map((e) => {
              const n = deTienda.filter((x) => x.e.actual?.id === e.id).length;
              return (
                <button
                  key={e.id}
                  type="button"
                  title={`Clientes cuya última etapa alcanzada es "${e.label}"`}
                  aria-pressed={etapa === e.id}
                  className={`chip${etapa === e.id ? " chip--on" : ""}`}
                  onClick={() => setEtapa(e.id)}
                >
                  {e.label} <span className="chip__count">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="filters__row filters__row--secondary">
            <input
              type="search"
              className="admin-search"
              placeholder="Buscar cliente por nombre"
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
            />
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">
              {clientes.length === 0 ? "Todavía no hay clientes aprobados" : "Nadie coincide"}
            </p>
            <p className="empty-state__hint">
              {clientes.length === 0
                ? "Aquí aparecerán en cuanto Aviva apruebe la solicitud de un cliente de tu tienda."
                : "Prueba con otra etapa o quita la búsqueda."}
            </p>
          </div>
        ) : (
          <>
            <div className="deals-table-wrapper">
              <table className="deals-table">
                <thead>
                  <tr>
                    {/* La etapa va pegada al nombre: es a lo que viene el vendedor,
                        y en celular lo demás queda a un deslizamiento. */}
                    <th className="col-sticky">Cliente</th>
                    <th>Va en</th>
                    <th>Sigue</th>
                    <th>Avance</th>
                    <th>Aprobado el</th>
                    {varias && <th>Tienda</th>}
                  </tr>
                </thead>
                <tbody>
                  {pag.map(({ c, e }) => (
                    <tr key={c.dealId}>
                      <td className="col-sticky cell-cliente">{c.cliente ?? "—"}</td>
                      <td>
                        {e.actual ? (
                          <span className="cell-done">
                            <span className="cell-done__check" aria-hidden>
                              ✓
                            </span>
                            {e.actual.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {e.completa ? (
                          <span className="vendedor-terminado">Terminado</span>
                        ) : (
                          <span className="cell-pending">{e.siguiente?.label ?? "—"}</span>
                        )}
                      </td>
                      <td>
                        <Avance hechas={completados(c)} total={etapas.length} />
                      </td>
                      <td>{fecha(c.fechaSolicitud)}</td>
                      {varias && (
                        <td className="cell-tienda">{(c.concesionarioId && nombres[c.concesionarioId]) ?? "—"}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion total={visibles.length} pagina={pagina} onPagina={setPagina} />
          </>
        )}
      </div>
    </main>
  );
}
