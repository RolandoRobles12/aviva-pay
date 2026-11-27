import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  adminMetricasNegocioCallable,
  type PeriodoMetricas,
  type BloqueNegocio, type MontoNegocio, type ResultadoNegocio } from "../../lib/firebase";
import { Badge, Card, Cargando, Notice, PageHeader } from "../../components/admin/ui";
import { BarrasHorizontales, Columnas } from "../../components/admin/graficas";

const PERIODOS: { valor: PeriodoMetricas; label: string }[] = [
  { valor: "semana", label: "Esta semana" },
  { valor: "semana-pasada", label: "Semana pasada" },
  { valor: "quincena", label: "Esta quincena" },
  { valor: "quincena-pasada", label: "Quincena pasada" },
  { valor: "30", label: "Últimos 30 días" },
  { valor: "90", label: "Últimos 90 días" },
  { valor: "180", label: "Últimos 6 meses" },
  { valor: "365", label: "Último año" },
];

const fechaCorta = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });

/**
 * "17 nov – 23 nov". `hasta` viene excluido; para mostrarlo se toma el
 * último instante que sí entra, así una semana cerrada termina en domingo.
 */
function rango(r: { desde: string; hasta: string }): string {
  const desde = fechaCorta.format(new Date(r.desde));
  const hasta = fechaCorta.format(new Date(Date.parse(r.hasta) - 1));
  return desde === hasta ? desde : `${desde} – ${hasta}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pesos(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 10_000) return `$${Math.round(v / 1_000).toLocaleString("es-MX")} mil`;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
/** Con un decimal abajo de 10: con números redondeados, "3 días ▲ 39%" parece un error. */
const dias = (v: number | null) => {
  if (v === null) return "—";
  const n = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${n.toLocaleString("es-MX")} ${n === 1 ? "día" : "días"}`;
};
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-MX"));
const creditos = (m: MontoNegocio) => `${m.creditos.toLocaleString("es-MX")} ${m.creditos === 1 ? "crédito" : "créditos"}`;

type Mejor = "sube" | "baja";

/** Personas de tienda + asesores; null si el periodo ya no está en la medición de uso. */
function personas(b: BloqueNegocio): number | null {
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
  if (puntos) {
    delta = Math.round((actual - anterior) * 100);
  } else {
    if (anterior === 0) return actual === 0 ? null : <span className="imp-cambio imp-cambio--neutro">El periodo anterior no hubo</span>;
    delta = Math.round(((actual - anterior) / Math.abs(anterior)) * 100);
  }
  if (delta === 0) return <span className="imp-cambio imp-cambio--neutro">Igual que el periodo anterior</span>;
  const sube = delta > 0;
  const bueno = sube === (mejor === "sube");
  const cuanto = puntos ? `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "punto" : "puntos"}` : `${Math.abs(delta)}%`;
  return (
    <span className={`imp-cambio imp-cambio--${bueno ? "bueno" : "malo"}`}>
      {sube ? "▲" : "▼"} {cuanto} <span className="imp-cambio__vs">{sube ? "más" : "menos"} que el periodo anterior</span>
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
 * Por qué el control se mide sobre menos créditos que los desembolsados:
 * los aprobados antes del arranque de su tienda se vendieron fuera de
 * Paydesk. Sin decirlo, "13" contra "133" arriba parece un error.
 */
function BaseControl({ desembolsados, base }: { desembolsados: number; base: number }) {
  const anteriores = desembolsados - base;
  if (anteriores <= 0) return null;
  return (
    <p className="imp-base">
      Solo cuentan los <strong>{base.toLocaleString("es-MX")}</strong> créditos aprobados desde que su tienda empezó a
      usar Paydesk. Los otros <strong>{anteriores.toLocaleString("es-MX")}</strong> se vendieron antes, fuera de Paydesk.
    </p>
  );
}

/**
 * Métricas: lo que Paydesk le cambia al negocio, en cuatro preguntas y
 * pocos números, cada uno contra el periodo anterior. Para admins y
 * stakeholders; la operación del día a día está en Revisión de documentos
 * (pestaña "Por tienda"), Vales y Uso del portal. Ver
 * functions/src/metricas/negocio.ts.
 */
export function MetricasPage() {
  const [periodo, setPeriodo] = useState<PeriodoMetricas>("90");
  const [datos, setDatos] = useState<ResultadoNegocio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDatos(null);
    setError(null);
    adminMetricasNegocioCallable({ periodo })
      .then((r) => !cancelado && setDatos(r.data))
      .catch((e) => !cancelado && setError(e instanceof Error ? e.message : "No se pudieron calcular las métricas."));
    return () => {
      cancelado = true;
    };
  }, [periodo]);

  return (
    <section>
      <PageHeader
        titulo="Métricas"
        descripcion="Cómo le va al negocio con Paydesk. Cada número se compara con el periodo anterior."
        acciones={
          <select aria-label="Periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoMetricas)}>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
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

function Contenido({ d }: { d: ResultadoNegocio }) {
  const { actual: a, anterior: p } = d;
  const ultimoMes = d.meses[d.meses.length - 1]?.mes;
  const controlIncompleto = (b: BloqueNegocio) => b.control.base.monto - b.control.completo.monto;

  return (
    <>
      <p className="imp-periodo">
        <strong>{rango(d.periodo.actual)}</strong> comparado con {rango(d.periodo.anterior)}
      </p>
      {d.avisos.sinArranque && (
        <Notice tono="warn" titulo="Falta la fecha en que las tiendas empezaron a usar Paydesk">
          <p>
            Sin esa fecha no se puede medir el control ni si los clientes usan su crédito. Ponla en{" "}
            <Link to="/admin/tiendas">Tiendas</Link>.
          </p>
        </Notice>
      )}
      {d.avisos.desembolsosSinMonto > 0 && (
        <Notice tono="warn" titulo={`${d.avisos.desembolsosSinMonto} créditos desembolsados no traen monto`}>
          <p>Los montos de abajo se quedan cortos. Revisa que el monto aprobado esté conectado en Conexión con HubSpot.</p>
        </Notice>
      )}

      <Pregunta
        numero={1}
        titulo="¿Cuánto crédito se desembolsa?"
        descripcion="Todo el crédito desembolsado en las tiendas aliadas, también el de créditos aprobados antes de usar Paydesk."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Crédito desembolsado"
            valor={pesos(a.credito.desembolsado.monto)}
            cambio={<Cambio actual={a.credito.desembolsado.monto} anterior={p.credito.desembolsado.monto} />}
            nota={creditos(a.credito.desembolsado)}
            destacado
          />
          <Indicador
            etiqueta="Crédito promedio"
            valor={a.credito.ticketPromedio === null ? "—" : pesos(a.credito.ticketPromedio)}
            cambio={<Cambio actual={a.credito.ticketPromedio} anterior={p.credito.ticketPromedio} />}
          />
          <Indicador
            etiqueta="Cobrado en caja con el vale"
            valor={pesos(a.credito.ventaEnCaja)}
            cambio={<Cambio actual={a.credito.ventaEnCaja} anterior={p.credito.ventaEnCaja} />}
            nota={
              a.credito.ventaArribaDelCredito > 0
                ? `${pesos(a.credito.ventaArribaDelCredito)} más de lo que cubría el crédito`
                : "Lo que cobraron las tiendas al validar el vale"
            }
          />
        </div>
        <h3 className="uso-subtitulo">Crédito desembolsado por mes</h3>
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
          vacio="No hubo desembolsos en los últimos 12 meses."
        />
      </Pregunta>

      <Pregunta
        numero={2}
        titulo="¿Cumple su objetivo de control?"
        descripcion="Un crédito tiene control completo cuando la tienda validó el vale en caja y subió el comprobante de entrega."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Control completo"
            valor={pct(a.control.pct)}
            cambio={<Cambio actual={a.control.pct} anterior={p.control.pct} puntos />}
            nota={
              a.control.base.creditos > 0
                ? `${pesos(a.control.completo.monto)} de ${pesos(a.control.base.monto)} · ${a.control.completo.creditos} de ${creditos(a.control.base)}`
                : "No hubo desembolsos de créditos de Paydesk en el periodo"
            }
            destacado
          />
          <Indicador
            etiqueta="Control incompleto"
            valor={pesos(controlIncompleto(a))}
            cambio={<Cambio actual={controlIncompleto(a)} anterior={controlIncompleto(p)} mejor="baja" />}
            nota={creditos({ creditos: a.control.base.creditos - a.control.completo.creditos, monto: 0 })}
          />
        </div>
        <BaseControl desembolsados={a.credito.desembolsado.creditos} base={a.control.base.creditos} />
        <div className="adm-grid uso-grid-2 imp-detalle">
          <div>
            <h3 className="uso-subtitulo">Qué les faltó</h3>
            <BarrasHorizontales
              tono="ambar"
              formato={pesos}
              vacio="A ningún crédito le faltó nada."
              filas={[
                { etiqueta: "No validaron el vale", m: a.control.sinVale },
                { etiqueta: "No subieron el comprobante", m: a.control.sinComprobante },
              ]
                .filter((f) => f.m.creditos > 0)
                .map((f) => ({ etiqueta: f.etiqueta, valor: f.m.monto, detalle: `(${creditos(f.m)})` }))}
            />
          </div>
          <div>
            <h3 className="uso-subtitulo">Lo que Paydesk frenó</h3>
            <ul className="imp-lista">
              <li>
                <strong>{num(a.control.subidasRechazadas)}</strong> documentos rechazados
                <Cambio actual={a.control.subidasRechazadas} anterior={p.control.subidasRechazadas} mejor="baja" />
              </li>
              <li>
                <strong>{num(a.control.valesDeOtraTienda)}</strong> vales de otra tienda
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
        titulo="¿Los clientes usan su crédito?"
        descripcion="Solo créditos aprobados desde que su tienda empezó a usar Paydesk. Un cliente usó su crédito si se le desembolsó o si validó su vale en caja."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Clientes que usaron su crédito"
            valor={pct(a.uso.tasaUso)}
            cambio={<Cambio actual={a.uso.tasaUso} anterior={p.uso.tasaUso} puntos />}
            nota={`${a.uso.usados.creditos} lo usaron · ${a.uso.sinUsar.creditos} se cancelaron sin usarlo`}
            destacado
          />
          <Indicador
            etiqueta="Crédito que no se usó"
            valor={pesos(a.uso.sinUsar.monto)}
            cambio={<Cambio actual={a.uso.sinUsar.monto} anterior={p.uso.sinUsar.monto} mejor="baja" />}
            nota={`No fueron a la tienda: ${pesos(a.uso.noFueron.monto)} · Fueron y no compraron: ${pesos(a.uso.fueronSinComprar.monto)}`}
          />
          <Indicador
            etiqueta="Días para desembolsar"
            valor={dias(a.uso.diasADesembolso)}
            cambio={<Cambio actual={a.uso.diasADesembolso} anterior={p.uso.diasADesembolso} mejor="baja" />}
            nota={
              <>
                La mitad de los créditos tarda esto o menos.
                {d.antesDePaydesk.diasADesembolso !== null && <> Antes de Paydesk: {dias(d.antesDePaydesk.diasADesembolso)}.</>}
              </>
            }
          />
        </div>
      </Pregunta>

      <Pregunta
        numero={4}
        titulo="¿Las tiendas lo usan?"
        descripcion="Una tienda está activa si subió un documento o validó un vale en el periodo."
      >
        <div className="imp-indicadores">
          <Indicador
            etiqueta="Tiendas activas"
            valor={`${a.adopcion.tiendasActivas} de ${a.adopcion.tiendasHabilitadas}`}
            cambio={<Cambio actual={a.adopcion.tiendasActivas} anterior={p.adopcion.tiendasActivas} />}
            nota="De las tiendas que tienen usuarios"
            destacado
          />
          <Indicador
            etiqueta="Créditos con cotización subida"
            valor={pct(a.adopcion.cotizacion.pct)}
            cambio={<Cambio actual={a.adopcion.cotizacion.pct} anterior={p.adopcion.cotizacion.pct} puntos />}
            nota={`${a.adopcion.cotizacion.conCotizacion} de ${a.adopcion.cotizacion.liberados} créditos liberados`}
          />
          <Indicador
            etiqueta="Personas que entraron"
            valor={num(personas(a))}
            cambio={<Cambio actual={personas(a)} anterior={personas(p)} />}
            nota={`${num(a.adopcion.personasTienda)} de tienda · ${num(a.adopcion.personasAsesor)} asesores de ventas`}
          />
        </div>
        {d.tiendasSinActividad.length > 0 && (
          <p className="imp-sin-actividad">
            <strong>Sin actividad:</strong> {d.tiendasSinActividad.join(", ")}.
          </p>
        )}
      </Pregunta>

      <Card titulo="Por tienda" descripcion="Del periodo elegido, de la que más crédito desembolsó a la que menos.">
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Tienda</th>
                <th className="num">Crédito desembolsado</th>
                <th className="num">Créditos</th>
                <th className="num" title="Vale validado en caja y comprobante de entrega">
                  Control completo
                </th>
                <th className="num" title="Se les desembolsó o validaron su vale, contra los que se cancelaron sin usarlo">
                  Usaron su crédito
                </th>
                <th className="num" title="La mitad de los créditos tarda esto o menos">
                  Días para desembolsar
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
                  <td className="num">{pct(t.tasaUso)}</td>
                  <td className="num">{dias(t.diasADesembolso)}</td>
                  <td>{t.activa ? <Badge tono="ok">Activa</Badge> : <Badge tono="warn">Sin actividad</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="adm-field__ayuda">Los montos son el monto aprobado de cada crédito en HubSpot.</p>
    </>
  );
}
