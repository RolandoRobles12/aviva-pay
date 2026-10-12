import { useEffect, useState } from "react";
import { adminMetricasCallable, type MetricasTienda } from "../../lib/firebase";
import { Badge, Cargando, Notice, PageHeader } from "../../components/admin/ui";

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
      <td className="num">{m.solicitudes}</td>
      <td className="num">{m.desembolsadas}</td>
      <td className="num">{dias(m.diasADesembolso)}</td>
      <td className="num">{m.documentos}</td>
      <td className="num">{pct(m.tasaRevision)}</td>
      <td className="num">{pct(m.tasaRechazo)}</td>
      <td className="num">{atencion(m.minutosAtencion)}</td>
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
      <PageHeader
        titulo="Métricas por tienda"
        descripcion="Cómo le va a cada tienda: cuánto tarda en desembolsar y qué pasa con los documentos que sube. Las que se salen de lo normal aparecen primero."
        acciones={
          <select aria-label="Periodo" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                Últimos {p} días
              </option>
            ))}
          </select>
        }
      />

      {error && <Notice tono="error">{error}</Notice>}
      {!datos && !error && <Cargando texto="Calculando..." />}
      {datos && (
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Tienda</th>
                <th className="num">Solicitudes</th>
                <th className="num">Desembolsos</th>
                <th className="num" title="Mediana, de aprobación a desembolso">
                  Días a desembolso
                </th>
                <th className="num">Documentos</th>
                <th className="num" title="Documentos que cayeron en revisión">
                  En revisión
                </th>
                <th className="num" title="Rechazados al subir o por un administrador">
                  Rechazados
                </th>
                <th className="num" title="Mediana de lo que tarda Aviva en resolver una revisión">
                  Atención de Aviva
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="metricas__global">
                <td>
                  <strong>Todas las tiendas</strong>
                </td>
                <Celdas m={datos.global} />
              </tr>
              {datos.tiendas.map((t) => (
                <tr key={t.concesionarioId}>
                  <td style={{ minWidth: "14rem" }}>
                    {t.nombre}
                    {t.alertas.map((a) => (
                      <div key={a} style={{ marginTop: "0.3rem" }}>
                        <Badge tono="warn">{a}</Badge>
                      </div>
                    ))}
                  </td>
                  <Celdas m={t} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="adm-field__ayuda" style={{ marginTop: "0.75rem" }}>
        Los datos de documentos cuentan desde que existe la verificación automática.
      </p>
    </section>
  );
}
