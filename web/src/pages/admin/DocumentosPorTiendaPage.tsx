import { useEffect, useState } from "react";
import { adminDocumentosPorTiendaCallable, type DocumentosTienda } from "../../lib/firebase";
import { Badge, Cargando, Notice, PageHeader } from "../../components/admin/ui";
import { TabsRevision } from "./RevisionPage";

const PERIODOS = [30, 90, 180, 365];

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function atencion(min: number | null): string {
  if (min === null) return "—";
  return min < 120 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`;
}

type Fila = Omit<DocumentosTienda, "concesionarioId" | "nombre" | "alertas">;

function Celdas({ m }: { m: Fila }) {
  return (
    <>
      <td className="num">{m.documentos}</td>
      <td className="num">{pct(m.tasaRevision)}</td>
      <td className="num">{pct(m.tasaRechazo)}</td>
      <td className="num">{atencion(m.minutosAtencion)}</td>
    </>
  );
}

/**
 * Documentos por tienda: para ver patrones, no casos sueltos. Las tiendas
 * con algo fuera de lo normal (muchos documentos en revisión o rechazados)
 * aparecen primero, con el motivo. Lo del negocio (desembolsos, días,
 * control) está en Métricas.
 */
export function DocumentosPorTiendaPage() {
  const [periodo, setPeriodo] = useState(90);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof adminDocumentosPorTiendaCallable>>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    adminDocumentosPorTiendaCallable({ dias: periodo })
      .then((r) => setDatos(r.data))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los documentos por tienda."));
  }, [periodo]);

  return (
    <section>
      <PageHeader
        titulo="Revisión de documentos"
        descripcion="Cómo le va a cada tienda con los documentos que sube: cuántos caen en revisión, cuántos se rechazan y cuánto tarda Aviva en revisarlos. Las que se salen de lo normal aparecen primero."
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
      <TabsRevision />

      {error && <Notice tono="error">{error}</Notice>}
      {!datos && !error && <Cargando texto="Calculando..." />}
      {datos && (
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Tienda</th>
                <th className="num" title="Lo que la tienda intentó subir: aceptado, en revisión o rechazado al subir">
                  Documentos
                </th>
                <th className="num" title="Documentos que cayeron en revisión">
                  En revisión
                </th>
                <th className="num" title="Rechazados al subir o por un administrador">
                  Rechazados
                </th>
                <th className="num" title="Lo normal (mediana) que tarda Aviva en resolver una revisión">
                  Revisión de Aviva
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
