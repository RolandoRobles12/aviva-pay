import { useEffect, useMemo, useState } from "react";
import type { DealVendedor } from "../lib/firebase";
import type { PayDeskConcesionario } from "../types/deal";
import { completados, etapaActual, getEtapas } from "../lib/dealScope";
import { Paginacion, POR_PAGINA } from "./Paginacion";
import { Avance } from "../capacitacion/piezas";
import { normalizarBusqueda } from "../capacitacion/progreso";

export const TODAS = "todas";

const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

/** Lo que la lista está enseñando, para las misiones del simulador del vendedor. */
export interface EstadoListaVendedor {
  etapa: string;
  tienda: string;
  busqueda: string;
  visibles: string[];
  actualizaciones: number;
}

/**
 * La lista del vendedor: filtros por tienda y por etapa, búsqueda y la
 * tabla de clientes con su etapa. La usan su pantalla real (/consulta) y
 * el simulador de su capacitación, para que practique en lo mismo que va
 * a usar.
 */
export function VendedorLista({
  concesionarios,
  clientes,
  consultadoEn,
  actualizando = false,
  onActualizar,
  onCambio,
}: {
  concesionarios: PayDeskConcesionario[];
  clientes: DealVendedor[];
  consultadoEn: string;
  actualizando?: boolean;
  onActualizar: () => void;
  /** Avisa qué está enseñando la lista después de cada cambio. */
  onCambio?: (estado: EstadoListaVendedor) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [tienda, setTienda] = useState(TODAS);
  const [etapa, setEtapa] = useState(TODAS);
  const [pagina, setPagina] = useState(0);
  const [actualizaciones, setActualizaciones] = useState(0);

  useEffect(() => setPagina(0), [busqueda, tienda, etapa]);

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

  const idsVisibles = visibles.map((x) => x.c.dealId).join(",");
  useEffect(() => {
    onCambio?.({
      etapa,
      tienda,
      busqueda,
      visibles: idsVisibles ? idsVisibles.split(",") : [],
      actualizaciones,
    });
  }, [etapa, tienda, busqueda, idsVisibles, actualizaciones, onCambio]);

  return (
    <>
      <div className="vendedor-cabeza">
        <div>
          <h1 className="concesionario-page__title vendedor-cabeza__titulo">Clientes aprobados</h1>
          <p className="concesionario-page__subtitle">
            Los clientes aprobados de tu tienda, por cuánto y en qué etapa va cada
            uno, para darles seguimiento. Los documentos y la caja los maneja el
            personal administrativo.
          </p>
        </div>
        <div className="vendedor-cabeza__refresco">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setActualizaciones((n) => n + 1);
              onActualizar();
            }}
            disabled={actualizando}
          >
            {actualizando ? "Actualizando..." : "Actualizar"}
          </button>
          <span className="form-note">
            Al{" "}
            {new Date(consultadoEn).toLocaleTimeString("es-MX", {
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
              : tienda !== TODAS
                ? "Prueba con otra etapa o tienda, o quita la búsqueda."
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
                  <th className="col-num">Monto aprobado</th>
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
                    <td className="col-num">
                      {c.montoAprobado === null ? "—" : moneda.format(c.montoAprobado)}
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
    </>
  );
}
