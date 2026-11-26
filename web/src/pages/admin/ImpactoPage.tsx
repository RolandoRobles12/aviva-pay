import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { adminImpactoCallable, type BloqueImpacto, type MontoImpacto, type ResultadoImpacto } from "../../lib/firebase";
import { Badge, Card, Cargando, Notice, PageHeader } from "../../components/admin/ui";
import { BarrasHorizontales, Columnas } from "../../components/admin/graficas";

const PERIODOS = [
  { dias: 30, label: "Últimos 30 días" },
  { dias: 90, label: "Últimos 90 días" },
  { dias: 180, label: "Últimos 6 meses" },
  { dias: 365, label: "Último año" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pesos(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 10_000) return `$${Math.round(v / 1_000).toLocaleString("es-MX")} mil`;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const dias = (v: number | null) => (v === null ? "—" : `${Math.round(v)} días`);
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-MX"));
const creditos = (m: MontoImpacto) => `${m.creditos.toLocaleString("es-MX")} ${m.creditos === 1 ? "crédito" : "créditos"}`;

type Mejor = "sube" | "baja";

/** Personas de tienda + asesores; null si el periodo ya no está en la medición de uso. */
function personas(b: BloqueImpacto): number | null {
  const { personasTienda: t, personasAsesor: s } = b.adopcion;
  return t === null || s === null ? null : t + s;
}

/**
 * El cambio contra el periodo anterior, en palabras y con flecha: nunca
 * solo con color. En porcentajes se compara en puntos; en lo demás, en %
 * del valor anterior (sin base no hay comparación).
 */
function Cambio({
  actual,
  anterior,
  mejor = "sube",
  puntos = false,
}: {
  actual: number | null;
  anterior: number | null;
  mejor?: Mejor;
  puntos?: boolean;
}) {
  if (actual === null || anterior === null) return null;
  let delta: number;
  let texto: string;
  if (puntos) {
    delta = Math.round((actual - anterior) * 100);
    texto = `${Math.abs(delta)} pts`;
  } else {
    if (anterior === 0) return actual === 0 ? null : <span className="imp-cambio imp-cambio--neutro">nuevo en este periodo</span>;
    delta = Math.round(((actual - anterior) / Math.abs(anterior)) * 100);
    texto = `${Math.abs(delta)}%`;
  }
  if (delta === 0) return <span className="imp-cambio imp-cambio--neutro">= igual que el periodo anterior</span>;
  const sube = delta > 0;
  const bueno = sube === (mejor === "sube");
  return (
    <span className={`imp-cambio imp-cambio--${bueno ? "bueno" : "malo"}`}>
      {sube ? "▲" : "▼"} {texto} <span className="imp-cambio__vs">vs. periodo anterior</span>
    </span>
  );
}

function Indicador({
  etiqueta,
  valor,
  cambio,
  nota,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  cambio?: ReactNode;
  nota?: ReactNode;
  destacado?: boolean;
}) {
  return (
    <div className={`imp-ind${destacado ? " imp-ind--destacado" : ""}`}>
      <span className="imp-ind__etiqueta">{etiqueta}</span>
      <span className="imp-ind__valor">{valor}</span>
      {cambio}
      {nota && <span className="imp-ind__nota">{nota}</span>}
    </div>
  );
}

function Pregunta({ numero, titulo, descripcion, children }: { numero: number; titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <Card
      titulo={
        <>
          <span className="imp-num" aria-hidden>
            {numero}
          </span>
          {titulo}
        </>
      }
      descripcion={descripcion}
    >
      {children}
    </Card>
  );
}

/**
 * "Impacto": lo que Paydesk le cambia al negocio, en cuatro preguntas y
 * pocos números, cada uno contra el periodo anterior. Para admins y
 * stakeholders; la operación del día a día está en Métricas y Uso del
 * portal. Ver functions/src/metricas/impacto.ts.
 */
export function ImpactoPage() {
  const [periodo, setPeriodo] = useState(90);
  const [datos, setDatos] = useState<ResultadoImpacto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDatos(null);
    setError(null);
    adminImpactoCallable({ dias: periodo })
      .then((r) => !cancelado && setDatos(r.data))
      .catch((e) => !cancelado && setError(e instanceof Error ? e.message : "No se pudo calcular el impacto."));
    return () => {
      cancelado = true;
    };
  }, [periodo]);

  return (
    <section className="impacto">
      <PageHeader
        titulo="Impacto"
        descripcion="Lo que Paydesk le cambia al negocio: cuánto crédito pasa por la herramienta, si cumple su objetivo de control, si el crédito se usa y llega más rápido, y si las tiendas la adoptan. Cada número se compara contra el periodo anterior de la misma duración."
        acciones={
          <select aria-label="Periodo" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            {PERIODOS.map((p) => (
              <option key={p.dias} value={p.dias}>
                {p.label}
              </option>
            ))}
          </select>
        }
      />

      {error && <Notice tono="error">{error}</Notice>}
      {!datos && !error && <Cargando texto="Calculando..." />}
      {datos && <Contenido d={datos} />}
    </section>
  );
}

function Contenido({ d }: { d: ResultadoImpacto }) {
  const { actual: a, anterior: p } = d;
  const ultimoMes = d.meses[d.meses.length - 1]?.mes;

  return (
    <>
      {d.avisos.sinArranque && (
        <Notice tono="warn" titulo="Todavía no hay fecha de arranque">
          <p>
            Sin fecha de arranque todos los créditos cuentan como anteriores a Paydesk, así que no hay base para medir el
            control ni la adopción. Ponla en <Link to="/admin/tiendas">Tiendas</Link>.
          </p>
        </Notice>
      )}
      {d.avisos.desembolsosSinMonto > 0 && (
        <Notice tono="warn" titulo={`${d.avisos.desembolsosSinMonto} desembolsos del periodo no traen monto`}>
          <p>
            Los montos de abajo se quedan cortos. Revisa que el monto aprobado esté conectado en Conexión con HubSpot.
          </p>
        </Notice>
      )}

      <Pregunta
        numero={1}
        titulo="¿Cuánto crédito pasa por Paydesk?"
        descripcion="Créditos desembolsados en las tiendas aliadas y lo que las tiendas cobraron en caja con el vale."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Monto desembolsado"
            valor={pesos(a.credito.desembolsado.monto)}
            cambio={<Cambio actual={a.credito.desembolsado.monto} anterior={p.credito.desembolsado.monto} />}
            nota={creditos(a.credito.desembolsado)}
            destacado
          />
          <Indicador
            etiqueta="Ticket promedio"
            valor={a.credito.ticketPromedio === null ? "—" : pesos(a.credito.ticketPromedio)}
            cambio={<Cambio actual={a.credito.ticketPromedio} anterior={p.credito.ticketPromedio} />}
          />
          <Indicador
            etiqueta="Venta confirmada en caja"
            valor={pesos(a.credito.ventaEnCaja)}
            cambio={<Cambio actual={a.credito.ventaEnCaja} anterior={p.credito.ventaEnCaja} />}
            nota={
              a.credito.ventaArribaDelCredito > 0
                ? `${pesos(a.credito.ventaArribaDelCredito)} de venta adicional sobre el crédito`
                : "Con el vale del cliente"
            }
          />
        </div>
        <h3 className="uso-subtitulo">Monto desembolsado por mes</h3>
        <Columnas
          columnas={d.meses.map((m) => {
            const [anio, mes] = m.mes.split("-");
            return {
              etiqueta: MESES[Number(mes) - 1],
              valor: m.desembolsado.monto,
              titulo: `${MESES[Number(mes) - 1]} ${anio}${m.mes === ultimoMes ? " (en curso)" : ""} · ${creditos(m.desembolsado)} · ${pct(m.pctControl)} con control completo`,
            };
          })}
          formato={pesos}
          vacio="Sin desembolsos en los últimos 12 meses."
        />
      </Pregunta>

      <Pregunta
        numero={2}
        titulo="¿Cumple su objetivo de control?"
        descripcion="Un desembolso tiene control completo cuando el vale del cliente se validó en caja y la tienda subió el comprobante de entrega. Cuenta solo créditos aprobados desde que su tienda arrancó en Paydesk."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Monto con control completo"
            valor={pct(a.control.pct)}
            cambio={<Cambio actual={a.control.pct} anterior={p.control.pct} puntos />}
            nota={
              a.control.base.creditos > 0
                ? `${pesos(a.control.completo.monto)} de ${pesos(a.control.base.monto)} · ${a.control.completo.creditos} de ${creditos(a.control.base)}`
                : "Sin desembolsos de créditos de Paydesk en el periodo"
            }
            destacado
          />
          <Indicador
            etiqueta="Desembolsado sin control completo"
            valor={pesos(a.control.base.monto - a.control.completo.monto)}
            cambio={
              <Cambio
                actual={a.control.base.monto - a.control.completo.monto}
                anterior={p.control.base.monto - p.control.completo.monto}
                mejor="baja"
              />
            }
            nota={`${a.control.base.creditos - a.control.completo.creditos} créditos`}
          />
        </div>
        <div className="adm-grid uso-grid-2 imp-detalle">
          <div>
            <h3 className="uso-subtitulo">Qué le faltó a los que no tienen control completo</h3>
            <BarrasHorizontales
              tono="ambar"
              formato={pesos}
              vacio="A ningún desembolso le faltó nada."
              filas={[
                { etiqueta: "Sin vale validado en caja", m: a.control.sinVale },
                { etiqueta: "Sin comprobante de entrega", m: a.control.sinComprobante },
              ]
                .filter((f) => f.m.creditos > 0)
                .map((f) => ({ etiqueta: f.etiqueta, valor: f.m.monto, detalle: `(${creditos(f.m)})` }))}
            />
          </div>
          <div>
            <h3 className="uso-subtitulo">Lo que Paydesk detuvo</h3>
            <ul className="imp-lista">
              <li>
                <strong>{num(a.control.subidasRechazadas)}</strong> documentos rechazados por la verificación o por un
                administrador <Cambio actual={a.control.subidasRechazadas} anterior={p.control.subidasRechazadas} mejor="baja" />
              </li>
              <li>
                <strong>{num(a.control.valesDeOtraTienda)}</strong> vales de otra tienda presentados en caja
              </li>
              <li>
                <strong>{num(a.control.codigosInexistentes)}</strong> códigos que no existen
              </li>
            </ul>
          </div>
        </div>
      </Pregunta>

      <Pregunta
        numero={3}
        titulo="¿El crédito se usa y llega más rápido?"
        descripcion="Cuántos clientes sí usan su crédito en la tienda, cuánto crédito se queda sin usar y cuánto tarda un crédito en desembolsarse."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Clientes que usaron su crédito"
            valor={pct(a.uso.tasaDisposicion)}
            cambio={<Cambio actual={a.uso.tasaDisposicion} anterior={p.uso.tasaDisposicion} puntos />}
            nota={`${a.uso.valesUsados} vales usados, ${a.uso.noAprovechado.creditos} vencieron o se cancelaron sin usarse`}
            destacado
          />
          <Indicador
            etiqueta="Crédito no aprovechado"
            valor={pesos(a.uso.noAprovechado.monto)}
            cambio={<Cambio actual={a.uso.noAprovechado.monto} anterior={p.uso.noAprovechado.monto} mejor="baja" />}
            nota={`El cliente no llegó: ${pesos(a.uso.clienteNoLlego.monto)} · Llegó y no se completó: ${pesos(a.uso.llegoSinCompletar.monto)}`}
          />
          <Indicador
            etiqueta="De aprobación a desembolso"
            valor={dias(a.uso.diasADesembolso)}
            cambio={<Cambio actual={a.uso.diasADesembolso} anterior={p.uso.diasADesembolso} mejor="baja" />}
            nota={
              d.velocidad.antes !== null && d.velocidad.conPaydesk !== null
                ? `Mediana. Antes de Paydesk: ${dias(d.velocidad.antes)} · Con Paydesk: ${dias(d.velocidad.conPaydesk)}`
                : "Mediana"
            }
          />
        </div>
      </Pregunta>

      <Pregunta
        numero={4}
        titulo="¿Las tiendas lo adoptan?"
        descripcion="Una tienda está activa si subió un documento o validó un vale en el periodo."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Tiendas activas"
            valor={`${a.adopcion.tiendasActivas} de ${a.adopcion.tiendasHabilitadas}`}
            cambio={<Cambio actual={a.adopcion.tiendasActivas} anterior={p.adopcion.tiendasActivas} />}
            nota="Sobre las tiendas con usuarios invitados"
            destacado
          />
          <Indicador
            etiqueta="Créditos con cotización en Paydesk"
            valor={pct(a.adopcion.cotizacion.pct)}
            cambio={<Cambio actual={a.adopcion.cotizacion.pct} anterior={p.adopcion.cotizacion.pct} puntos />}
            nota={`${a.adopcion.cotizacion.conCotizacion} de ${a.adopcion.cotizacion.liberados} créditos liberados`}
          />
          <Indicador
            etiqueta="Personas que lo usaron"
            valor={num(personas(a))}
            cambio={<Cambio actual={personas(a)} anterior={personas(p)} />}
            nota={`${num(a.adopcion.personasTienda)} de tienda · ${num(a.adopcion.personasAsesor)} asesores de ventas`}
          />
        </div>
        {d.tiendasSinActividad.length > 0 && (
          <p className="imp-sin-actividad">
            <strong>Sin actividad en el periodo:</strong> {d.tiendasSinActividad.join(", ")}.
          </p>
        )}
      </Pregunta>

      <Card titulo="Por tienda" descripcion="Del periodo elegido, ordenadas por monto desembolsado.">
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Tienda</th>
                <th className="num">Desembolsado</th>
                <th className="num">Créditos</th>
                <th className="num" title="Vale validado en caja + comprobante de entrega, por monto">
                  Control completo
                </th>
                <th className="num" title="Vales usados entre los que se usaron o murieron sin usarse">
                  Usaron su crédito
                </th>
                <th className="num" title="Mediana, de aprobación a desembolso">
                  Días a desembolso
                </th>
                <th>Actividad</th>
              </tr>
            </thead>
            <tbody>
              {d.tiendas.map((t) => (
                <tr key={t.concesionarioId}>
                  <td>{t.nombre}</td>
                  <td className="num">{pesos(t.desembolsado.monto)}</td>
                  <td className="num">{t.desembolsado.creditos}</td>
                  <td className="num">{pct(t.pctControl)}</td>
                  <td className="num">{pct(t.tasaDisposicion)}</td>
                  <td className="num">{t.diasADesembolso === null ? "—" : Math.round(t.diasADesembolso)}</td>
                  <td>{t.activa ? <Badge tono="ok">Activa</Badge> : <Badge tono="warn">Sin actividad</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="adm-field__ayuda">
        Los montos son el monto aprobado de cada crédito, según HubSpot. Los documentos rechazados cuentan desde que
        existe la verificación automática, y las personas, mientras se conserve la medición de uso.
      </p>
    </>
  );
}
