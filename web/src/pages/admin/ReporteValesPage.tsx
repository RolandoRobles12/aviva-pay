import { useEffect, useState } from "react";
import { adminValeIntentosCallable, adminValeReporteCallable } from "../../lib/firebase";
import { StatTiles } from "../../components/StatTiles";
import { Cargando, EmptyState, Notice, PageHeader } from "../../components/admin/ui";
import { TabsVales } from "./ValesPage";
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([adminValeReporteCallable(), adminValeIntentosCallable({ limite: 100 })])
      .then(([r, i]) => {
        setReporte(r.data);
        setIntentos(i.data.intentos);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "No se pudo cargar el reporte."),
      )
      .finally(() => setCargando(false));
  }, []);

  const encabezado = (
    <>
      <PageHeader
        titulo="Vales"
        descripcion="Cuánto del crédito liberado se está usando en las tiendas, y cuánto se está quedando sin usar."
      />
      <TabsVales />
    </>
  );

  if (cargando) {
    return (
      <>
        {encabezado}
        <Cargando texto="Cargando reporte..." />
      </>
    );
  }

  return (
    <section>
      {encabezado}
      {error && <Notice tono="error">{error}</Notice>}

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

          {/* De los que murieron sin usarse: quién ni llegó, y quién llegó
              y no se completó. Son problemas distintos y se atacan
              distinto — uno antes de la tienda, otro en la caja. */}
          <StatTiles
            stats={[
              {
                label: "Murieron sin que el cliente llegara",
                value: String(reporte.sinUsar.nuncaLeidos),
              },
              {
                label: "Llegó y no se completó",
                value: String(reporte.sinUsar.leidosSinUsar),
                tone: reporte.sinUsar.leidosSinUsar > 0 ? "accion" : "neutral",
              },
            ]}
          />

          <h2 className="admin-title admin-title--secondary">Por tienda</h2>
          <div className="adm-tabla-wrap">
            <table className="adm-tabla">
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th className="num">Vigentes</th>
                  <th className="num">Utilizados</th>
                  <th className="num">Vencidos</th>
                  <th className="num">Cancelados</th>
                  <th className="num">Dispuesto</th>
                  <th className="num">Nunca gastado</th>
                </tr>
              </thead>
              <tbody>
                {reporte.porTienda.map((t) => (
                  <tr key={t.concesionarioId}>
                    <td>{t.tienda}</td>
                    <td className="num">{t.vigente}</td>
                    <td className="num">{t.utilizado}</td>
                    <td className="num">{t.vencido}</td>
                    <td className="num">{t.cancelado}</td>
                    <td className="num">{moneda.format(t.montoDispuesto)}</td>
                    <td className="num">{moneda.format(t.montoNuncaGastado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="admin-title admin-title--secondary">Intentos sospechosos</h2>
      <p className="admin-subtitle">
        Un código que no existe puede ser un error al teclearlo. Un vale de otra
        tienda no: significa que esa tienda tuvo enfrente un vale que no le tocaba.
      </p>

      {intentos.length === 0 ? (
        <EmptyState titulo="Sin intentos sospechosos">Nadie ha probado códigos inexistentes ni vales de otra tienda.</EmptyState>
      ) : (
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
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

    </section>
  );
}
