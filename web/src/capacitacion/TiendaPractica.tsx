import { useEffect, useMemo, useRef, useState } from "react";
import { DealsTable } from "../components/DealsTable";
import { DealFilters, FILTROS_INICIALES, aplicarFiltros, type Filtros } from "../components/DealFilters";
import { Modal } from "../components/Modal";
import { CotizacionUploadForm } from "../components/CotizacionUploadForm";
import { ComprobanteUploadForm } from "../components/ComprobanteUploadForm";
import { requiereAccion } from "../lib/dealScope";
import { ordenarDeals, type SortKey, type SortState } from "../lib/dealSort";
import { SubidaError, type UploadResult } from "../lib/uploads";
import type { PayDeskDeal } from "../types/deal";
import { useCapacitacion } from "./contexto";
import {
  TIENDA_PRACTICA,
  dealsIniciales,
  rolloutPractica,
  subirPractica,
  type SubidaPractica,
} from "./datosTiendaPractica";

export interface EstadoTienda {
  deals: PayDeskDeal[];
  /** Lo que la lista enseña con los filtros actuales. */
  visibles: PayDeskDeal[];
  filtros: Filtros;
}

export interface MisionTienda {
  id: string;
  texto: string;
  /** Una pista por si se atora, en el mismo tono que la lección. */
  pista?: string;
  hecha: (s: EstadoTienda) => boolean;
}

const NOMBRES = { [TIENDA_PRACTICA]: "Tienda de práctica" };
const ESPERA_MS = 500;

type Ventana = { tipo: "cotizacion" | "comprobante"; dealId: string } | null;

/**
 * "Mis clientes" en modo práctica: la lista, los filtros y las ventanas
 * de subida son los componentes reales; los clientes y las respuestas del
 * servidor salen de datosTiendaPractica.ts. La persona hace la tarea de verdad
 * —elige un archivo, captura la fecha, marca la firma— y ve cómo cambia
 * la fila, sin que nada salga de su navegador.
 *
 * Cada lección le da sus propias misiones; cuando todas se cumplen, avisa
 * con `onCompletado` (una vez).
 */
export function TiendaPractica({
  misiones,
  onCompletado,
}: {
  misiones: MisionTienda[];
  onCompletado: () => void;
}) {
  const { labels, origenDisposicion } = useCapacitacion();
  const [deals, setDeals] = useState<PayDeskDeal[]>(() => dealsIniciales());
  const rollout = useMemo(() => rolloutPractica(), []);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [sort, setSort] = useState<SortState | null>({ key: "fechaSolicitud", dir: "desc" });
  const [ventana, setVentana] = useState<Ventana>(null);
  const avisado = useRef(false);
  // El formulario lee la lista vigente al terminar la "subida", no la del
  // momento en que se abrió la ventana.
  const dealsRef = useRef(deals);
  dealsRef.current = deals;

  const visibles = useMemo(
    () => ordenarDeals(aplicarFiltros(deals, filtros, rollout), sort, NOMBRES),
    [deals, filtros, rollout, sort],
  );
  const estado: EstadoTienda = { deals, visibles, filtros };
  // Una misión cumplida se queda cumplida: "deja solo los que te tocan" no
  // se debe desmarcar porque después cambió el filtro para buscar a otro.
  const [logradas, setLogradas] = useState<ReadonlySet<string>>(new Set());
  const ahora = misiones.filter((m) => m.hecha(estado)).map((m) => m.id);
  const nuevas = ahora.filter((id) => !logradas.has(id)).join(",");
  useEffect(() => {
    if (nuevas) setLogradas((prev) => new Set([...prev, ...nuevas.split(",")]));
  }, [nuevas]);
  const hechas = misiones.map((m) => logradas.has(m.id) || ahora.includes(m.id));
  const todas = hechas.every(Boolean);

  useEffect(() => {
    if (todas && !avisado.current) {
      avisado.current = true;
      onCompletado();
    }
  }, [todas, onCompletado]);

  const porHacer = deals.filter((d) => requiereAccion(d, rollout)).length;

  async function subir(s: SubidaPractica): Promise<UploadResult> {
    await new Promise((r) => setTimeout(r, ESPERA_MS));
    const { deals: nuevos, resultado } = subirPractica(dealsRef.current, s);
    setDeals(nuevos);
    if (!resultado.ok) throw new SubidaError(resultado.mensaje, resultado.revisionManualDisponible);
    return { ok: true, enRevision: resultado.enRevision, verificacion: null };
  }

  function handleSort(key: SortKey) {
    setSort((a) => (a?.key === key ? { key, dir: a.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  const dealVentana = ventana ? deals.find((d) => d.dealId === ventana.dealId) : undefined;

  return (
    <div className="cap-simulador cap-tienda">
      <div className="cap-simulador__banda">
        Tienda de práctica · Clientes inventados. Nada de lo que subas sale de tu navegador.
      </div>

      <div className="cap-tienda__misiones">
        <p className="cap-simulador__titulo">
          Tus misiones · {hechas.filter(Boolean).length} de {misiones.length}
        </p>
        <ol>
          {misiones.map((m, i) => (
            <li key={m.id} className={hechas[i] ? "cap-tienda__mision--hecha" : undefined}>
              <span className="cap-mision__check" aria-hidden>
                {hechas[i] ? "✓" : ""}
              </span>
              <span>
                {m.texto}
                {m.pista && !hechas[i] && <span className="cap-tienda__pista">{m.pista}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="cap-tienda__lista">
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
        <DealFilters deals={deals} filtros={filtros} rolloutPorTienda={rollout} onChange={setFiltros} />
        {visibles.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">Nada en este periodo</p>
            <p className="empty-state__hint">
              Tienes {deals.length} solicitudes en total, pero ninguna coincide con el filtro de arriba.
            </p>
            <button type="button" className="upload-button" onClick={() => setFiltros({ ...filtros, periodo: "todo" })}>
              Ver todo
            </button>
          </div>
        ) : (
          <DealsTable
            deals={visibles}
            labels={labels}
            rolloutPorTienda={rollout}
            origenDisposicion={origenDisposicion}
            concesionarioNombres={NOMBRES}
            sort={sort}
            onSort={handleSort}
            onUploadCotizacion={(dealId) => setVentana({ tipo: "cotizacion", dealId })}
            onUploadComprobante={(dealId) => setVentana({ tipo: "comprobante", dealId })}
          />
        )}
      </div>

      {ventana && dealVentana && (
        <Modal onClose={() => setVentana(null)}>
          {ventana.tipo === "cotizacion" ? (
            <CotizacionUploadForm
              dealId={ventana.dealId}
              labels={labels}
              // Sin "Ver archivo actual": esa liga pide el archivo al servidor.
              reemplazo={false}
              rechazosAuto={dealVentana.cotizacionRechazosAuto ?? 0}
              onUploaded={() => setVentana(null)}
              onCancel={() => setVentana(null)}
              onUpload={(p) =>
                subir({
                  tipo: "cotizacion",
                  dealId: p.dealId,
                  fecha: p.fechaEntregaAcordada,
                  montoTotalCompra: p.montoTotalCompra,
                  solicitudManual: p.solicitudManual,
                })
              }
            />
          ) : (
            <ComprobanteUploadForm
              dealId={ventana.dealId}
              labels={labels}
              reemplazo={false}
              rechazosAuto={dealVentana.comprobanteRechazosAuto ?? 0}
              onUploaded={() => setVentana(null)}
              onCancel={() => setVentana(null)}
              onUpload={(p) =>
                subir({
                  tipo: "comprobante",
                  dealId: p.dealId,
                  fecha: p.fechaEntrega,
                  solicitudManual: p.solicitudManual,
                })
              }
            />
          )}
        </Modal>
      )}
    </div>
  );
}

/** Atajos para escribir misiones sobre un cliente de la práctica. */
export const cliente = (s: EstadoTienda, id: string) => s.deals.find((d) => d.dealId === id);
export const seVe = (s: EstadoTienda, id: string) => s.visibles.some((d) => d.dealId === id);
