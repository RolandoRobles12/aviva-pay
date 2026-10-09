import { useEffect, useState } from "react";
import { adminMetricasCallable, type MetricasTienda } from "../../lib/firebase";

const PERIODOS = [30, 90, 180, 365];

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function dias(v: number | null): string {
  return v === null ? "—" : `${Math.round(v)} d`;
}

function atencion(min: number | null): string {
  if (min === null) return "—";
  return min < 120 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`;
}

type Fila = Omit<MetricasTienda, "concesionarioId" | "nombre" | "alertas">;

function Celdas({ m }: { m: Fila }) {
  return (
    <>
      <td className="col-num">{m.solicitudes}</td>
      <td className="col-num">{m.desembolsadas}</td>
      <td className="col-num">{dias(m.diasADesembolso)}</td>
      <td className="col-num">{m.documentos}</td>
      <td className="col-num">{pct(m.tasaRevision)}</td>
      <td className="col-num">{pct(m.tasaRechazo)}</td>
      <td className="col-num">{atencion(m.minutosAtencion)}</td>
    </>
  );
}

/**
 * Métricas por tienda: para ver patrones, no casos sueltos. Las tiendas con
 * algo fuera de lo normal (muchos documentos en revisión o rechazados,
 * desembolsos muy lentos) aparecen primero, con el motivo.
 */
export function MetricasPage() {
  const [periodo, setPeriodo] = useState(90);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof adminMetricasCallable>>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    adminMetricasCallable({ dias: periodo })
      .then((r) => setDatos(r.data))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las métricas."));
  }, [periodo]);

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">Métricas por tienda</h1>
          <p className="admin-subtitle">
            Solicitudes aprobadas y desembolsos en el periodo, y qué pasó con
            los documentos que subió cada tienda. Las métricas de documentos
            cuentan desde que existe la verificación automática.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                Últimos {p} días
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="page-message page-message--error">{error}</p>}
      {!datos && !error && <p className="page-message">Calculando...</p>}
      {datos && (
        <div className="deals-table-wrapper">
          <table className="deals-table">
            <thead>
              <tr>
                <th className="col-sticky">Tienda</th>
                <th className="col-num">Solicitudes</th>
                <th className="col-num">Desembolsos</th>
                <th className="col-num" title="Mediana, de aprobación a desembolso">
                  Días a desembolso
                </th>
                <th className="col-num">Documentos</th>
                <th className="col-num">En revisión</th>
                <th className="col-num" title="Rechazados al subir o por un administrador">
                  Rechazados
                </th>
                <th className="col-num" title="Mediana de lo que tarda Aviva en atender una revisión">
                  Atención
                </th>
                <th>Para revisar</th>
              </tr>
            </thead>
            <tbody>
              <tr className="metricas__global">
                <td className="col-sticky">
                  <strong>Todas</strong>
                </td>
                <Celdas m={datos.global} />
                <td></td>
              </tr>
              {datos.tiendas.map((t) => (
                <tr key={t.concesionarioId}>
                  <td className="col-sticky">{t.nombre}</td>
                  <Celdas m={t} />
                  <td>
                    {t.alertas.length > 0 && (
                      <span className="cell-rejected">{t.alertas.join(" · ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
