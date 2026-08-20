import type { PayDeskDeal } from "../types/deal";
import { MILESTONE_LABELS, milestones } from "../lib/dealScope";

function moneda(n: number, decimales = 0): string {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: decimales,
  });
}

/** Median, not mean: one client stuck for a year would drag an average somewhere no real case sits. */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[medio - 1] + ordenados[medio]) / 2
    : ordenados[medio];
}

const DIA_MS = 86_400_000;

/**
 * The store's own numbers, over whatever subset the filters left showing.
 *
 * Two questions it answers: where do my clients pile up, and what is that
 * worth to me. The funnel is a plain magnitude comparison across seven
 * ordered stages, so it's horizontal bars sharing one axis and one hue —
 * the stage names are the identity, the length is the only variable.
 */
export function DealsSummary({ deals }: { deals: PayDeskDeal[] }) {
  const total = deals.length;

  if (total === 0) return null;

  const porEtapa = MILESTONE_LABELS.map((label, i) => ({
    label,
    count: deals.filter((d) => milestones(d)[i]).length,
  }));

  const desembolsados = deals.filter((d) => d.desembolsoFecha);
  const montoAprobado = deals.reduce((s, d) => s + (d.montoAprobado ?? 0), 0);
  const montoDesembolsado = desembolsados.reduce(
    (s, d) => s + (d.montoAprobado ?? 0),
    0,
  );
  const ticketPromedio = total > 0 ? montoAprobado / total : 0;
  const conversion = total > 0 ? (desembolsados.length / total) * 100 : 0;

  const diasACierre = mediana(
    desembolsados
      .filter((d) => d.fechaSolicitud && d.desembolsoFecha)
      .map(
        (d) =>
          (new Date(d.desembolsoFecha!).getTime() -
            new Date(d.fechaSolicitud!).getTime()) /
          DIA_MS,
      )
      .filter((d) => d >= 0),
  );

  // Every bar is a share of the whole set, so stage 1 is the natural 100%
  // reference and the funnel reads as "how many made it this far".
  const maximo = Math.max(...porEtapa.map((e) => e.count), 1);

  return (
    <section className="summary">
      <div className="summary__panel">
        <h2 className="summary__title">¿Dónde van tus clientes?</h2>
        <p className="summary__hint">
          Cuántos han llegado a cada etapa, de {total.toLocaleString("es-MX")}{" "}
          {total === 1 ? "solicitud" : "solicitudes"}.
        </p>

        <ul className="funnel">
          {porEtapa.map((e) => {
            const pct = total > 0 ? (e.count / total) * 100 : 0;
            return (
              <li className="funnel__row" key={e.label}>
                <span className="funnel__label">{e.label}</span>
                <span className="funnel__track">
                  <span
                    className="funnel__bar"
                    style={{ width: `${(e.count / maximo) * 100}%` }}
                    role="img"
                    aria-label={`${e.count} de ${total} (${Math.round(pct)}%)`}
                  />
                </span>
                <span className="funnel__value">
                  {e.count.toLocaleString("es-MX")}
                  <span className="funnel__pct">{Math.round(pct)}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="summary__panel">
        <h2 className="summary__title">Tus números</h2>
        <dl className="insights">
          <div className="insight">
            <dt>Desembolsado</dt>
            <dd className="insight__value">{moneda(montoDesembolsado)}</dd>
            <dd className="insight__note">
              de {moneda(montoAprobado)} aprobados
            </dd>
          </div>
          <div className="insight">
            <dt>Llegaron a desembolso</dt>
            <dd className="insight__value">{Math.round(conversion)}%</dd>
            <dd className="insight__note">
              {desembolsados.length.toLocaleString("es-MX")} de{" "}
              {total.toLocaleString("es-MX")} clientes
            </dd>
          </div>
          <div className="insight">
            <dt>Compra promedio</dt>
            <dd className="insight__value">{moneda(ticketPromedio)}</dd>
            <dd className="insight__note">crédito aprobado por cliente</dd>
          </div>
          <div className="insight">
            <dt>Tiempo al desembolso</dt>
            <dd className="insight__value">
              {diasACierre === null ? "—" : `${Math.round(diasACierre)} días`}
            </dd>
            <dd className="insight__note">
              {diasACierre === null
                ? "aún sin desembolsos"
                : "mediana, de aprobación a desembolso"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
