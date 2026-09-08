import { useEffect, useState } from "react";
import {
  adminGetCancelStagesCallable,
  adminSetCancelStagesCallable,
  adminValeIntentosCallable,
  adminValeReporteCallable,
} from "../../lib/firebase";
import { StatTiles } from "../../components/StatTiles";
import type { ValeIntento, ValeReporte } from "../../types/vale";

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MOTIVO: Record<ValeIntento["motivo"], string> = {
  "no-existe": "Código que no existe",
  "otra-tienda": "Vale de otra tienda",
};

/**
 * El reporte de vales y la bitácora de intentos.
 *
 * Son conteos actuales y una tabla, no una serie en el tiempo, así que la
 * forma correcta son mosaicos de cifra y una tabla — no hay nada que
 * graficar. Se reutiliza StatTiles en vez de inventar otra fila de KPIs,
 * para que estas cifras se lean igual que las del portal de la tienda.
 */
export function ReporteValesPage() {
  const [reporte, setReporte] = useState<ValeReporte | null>(null);
  const [intentos, setIntentos] = useState<ValeIntento[]>([]);
  const [etapas, setEtapas] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([
      adminValeReporteCallable(),
      adminValeIntentosCallable({ limite: 100 }),
      adminGetCancelStagesCallable(),
    ])
      .then(([r, i, e]) => {
        setReporte(r.data);
        setIntentos(i.data.intentos);
        setEtapas(e.data.etapas.join(", "));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "No se pudo cargar el reporte."),
      )
      .finally(() => setCargando(false));
  }, []);

  async function guardarEtapas(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await adminSetCancelStagesCallable({
        etapas: etapas.split(",").map((x) => x.trim()).filter(Boolean),
      });
      setAviso("Etapas guardadas. Aplican dentro del siguiente minuto.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="page-message">Cargando reporte...</p>;

  return (
    <section>
      <h1 className="admin-title">Reporte de vales</h1>
      <p className="admin-subtitle">
        Cuánto del crédito liberado se está ejerciendo, y cuánto se está quedando
        en el aire.
      </p>

      {error && <p className="page-message page-message--error">{error}</p>}
      {aviso && <p className="form-success">{aviso}</p>}

      {reporte && (
        <>
          <StatTiles
            stats={[
              { label: "Vigentes", value: String(reporte.totales.vigente) },
              { label: "Utilizados", value: String(reporte.totales.utilizado) },
              {
                label: "Vencieron sin usarse",
                value: String(reporte.totales.vencido),
                tone: reporte.totales.vencido > 0 ? "accion" : "neutral",
              },
              { label: "Cancelados", value: String(reporte.totales.cancelado) },
            ]}
          />

          {/* La cifra que motiva el reporte: crédito que Aviva liberó y
              aprovisionó, y que nadie ejerció. Es la lista para adelantar
              cancelaciones en vez de esperar a que el plazo corra solo. */}
          <StatTiles
            stats={[
              {
                label: "Crédito nunca gastado",
                value: moneda.format(reporte.montos.nuncaGastado),
                tone: reporte.montos.nuncaGastado > 0 ? "accion" : "neutral",
              },
              {
                label: "Autorizado en vales usados",
                value: moneda.format(reporte.montos.autorizadoDeUtilizados),
              },
              {
                label: "Dispuesto de verdad",
                value: moneda.format(reporte.montos.dispuesto),
              },
              {
                label: "Sub-ejercido",
                value: moneda.format(reporte.montos.subejercido),
              },
            ]}
          />

          <h2 className="admin-title admin-title--secondary">Por tienda</h2>
          <div className="deals-table-wrapper">
            <table className="deals-table">
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th className="col-num">Vigentes</th>
                  <th className="col-num">Utilizados</th>
                  <th className="col-num">Vencidos</th>
                  <th className="col-num">Cancelados</th>
                  <th className="col-num">Dispuesto</th>
                  <th className="col-num">Nunca gastado</th>
                </tr>
              </thead>
              <tbody>
                {reporte.porTienda.map((t) => (
                  <tr key={t.concesionarioId}>
                    <td>{t.tienda}</td>
                    <td className="col-num">{t.vigente}</td>
                    <td className="col-num">{t.utilizado}</td>
                    <td className="col-num">{t.vencido}</td>
                    <td className="col-num">{t.cancelado}</td>
                    <td className="col-num">{moneda.format(t.montoDispuesto)}</td>
                    <td className="col-num">{moneda.format(t.montoNuncaGastado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="admin-title admin-title--secondary">Intentos sospechosos</h2>
      <p className="admin-subtitle">
        Un código que no existe puede ser un dedazo. Un vale de otra tienda no:
        significa que esa tienda tuvo enfrente un vale que no le tocaba.
      </p>

      {intentos.length === 0 ? (
        <p className="page-message">Ningún intento fallido registrado.</p>
      ) : (
        <div className="deals-table-wrapper">
          <table className="deals-table">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Motivo</th>
                <th>Código</th>
                <th>Tienda</th>
                <th>Quién</th>
                <th>Medio</th>
              </tr>
            </thead>
            <tbody>
              {intentos.map((i, idx) => (
                <tr key={`${i.codigo}-${i.en}-${idx}`}>
                  <td>{fecha(i.en)}</td>
                  <td>
                    {/* Nunca verde: los dos son intentos fallidos. Ámbar
                        para el vale ajeno, que es el que pide mirada; gris
                        para el dedazo, que casi siempre no es nada. Verde
                        en esta app significa "válido", y aquí diría lo
                        contrario de lo que pasó. */}
                    <span
                      className={`vale-chip vale-chip--${
                        i.motivo === "otra-tienda" ? "ambar" : "neutro"
                      }`}
                    >
                      {MOTIVO[i.motivo]}
                    </span>
                  </td>
                  <td>{i.codigo}</td>
                  <td>{i.concesionarioId ?? "—"}</td>
                  <td>{i.email ?? i.uid}</td>
                  <td>{i.medio === "escaneo" ? "Escaneo" : "Tecleado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="admin-title admin-title--secondary">Etapas de cancelación</h2>
      <form className="vales-card" onSubmit={guardarEtapas}>
        <label htmlFor="etapas-cancelacion">
          Ids de etapa de HubSpot que significan "este crédito ya no existe"
        </label>
        <input
          id="etapas-cancelacion"
          value={etapas}
          onChange={(e) => setEtapas(e.target.value)}
          placeholder="1341580191, 1341580192"
        />
        <button type="submit" disabled={guardando || !etapas.trim()}>
          {guardando ? "Guardando..." : "Guardar etapas"}
        </button>
        <p className="form-note">
          Separadas por coma. En cuanto un deal entra a una de estas etapas, su
          vale se apaga y deja de servir en cualquier caja, y la solicitud sale
          de la lista de la tienda. Precancelación entra a propósito: matar un
          vale de más se arregla reemitiéndolo; dejarlo vivo de más significa
          entregar material contra un crédito que ya se está retirando.
        </p>
      </form>
    </section>
  );
}
