import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  adminGetUsoConfigCallable,
  adminListConcesionariosCallable,
  adminListGrabacionesCallable,
  adminSetUsoConfigCallable,
  type FiltroUso,
  type GrabacionResumen,
  type UsoConfig,
} from "../../lib/firebase";
import { useEsSuperAdmin } from "../../lib/adminRol";
import { Badge, Card, Cargando, EmptyState, Field, MensajeInline, Notice, PageHeader, Tabs } from "../../components/admin/ui";
import { FiltrosUso, PESTANAS_USO, fechaHora } from "./UsoPage";

const NOMBRE_DISPOSITIVO = { escritorio: "Computadora", tablet: "Tablet", celular: "Celular" } as const;

export function duracion(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Las sesiones grabadas, para ver como video lo que le pasó a una tienda.
 * Arriba, qué se graba: un % al azar y, si hace falta, todas las sesiones
 * de una persona por unos días.
 */
export function UsoGrabacionesPage() {
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState<FiltroUso>({ dias: 7 });
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [buscar, setBuscar] = useState(params.get("email") ?? "");
  const [lista, setLista] = useState<GrabacionResumen[] | null>(null);
  const [tiendas, setTiendas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLista(null);
    setError(null);
    adminListGrabacionesCallable({ ...filtro, ...(buscar ? { email: buscar } : {}) })
      .then((r) => {
        if (cancelado) return;
        setTiendas(r.data.tiendas);
        setLista(r.data.grabaciones);
      })
      .catch((e) => !cancelado && setError(e instanceof Error ? e.message : "No se pudieron cargar las grabaciones."));
    return () => {
      cancelado = true;
    };
  }, [filtro, buscar]);

  return (
    <section>
      <PageHeader
        titulo="Uso del portal"
        descripcion="Sesiones grabadas: la pantalla reconstruida de lo que hizo una persona, con lo que escribe y los datos de clientes tapados."
      />
      <Tabs items={PESTANAS_USO} />

      <ConfigGrabacion />

      <FiltrosUso filtro={filtro} setFiltro={setFiltro} tiendas={tiendas}>
        <form
          className="uso-filtros__buscar"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscar(email.trim().toLowerCase());
          }}
        >
          <input
            type="search"
            aria-label="Correo"
            placeholder="Correo de la persona"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (!e.target.value) setBuscar("");
            }}
          />
          <button type="submit" className="adm-btn adm-btn--secundario adm-btn--chico">
            Buscar
          </button>
        </form>
      </FiltrosUso>

      {error && <Notice tono="error">{error}</Notice>}
      {!lista && !error && <Cargando />}
      {lista && lista.length === 0 && (
        <EmptyState icono="—" titulo="No hay sesiones grabadas con estos filtros">
          <p>Prueba con un periodo más largo, o marca a una persona para grabar todas sus sesiones.</p>
        </EmptyState>
      )}
      {lista && lista.length > 0 && (
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Persona</th>
                <th>Tienda</th>
                <th>Equipo</th>
                <th className="num">Duración</th>
                <th>Pantallas</th>
                <th className="num">Peso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((g) => (
                <tr key={g.sesionId}>
                  <td style={{ whiteSpace: "nowrap" }}>{fechaHora(g.inicio)}</td>
                  <td>
                    {g.email ?? "—"}
                    {g.elegida && (
                      <div>
                        <Badge tono="neutro" title="Se grabó porque se eligió a esta persona, no al azar">
                          Elegida
                        </Badge>
                      </div>
                    )}
                  </td>
                  <td>{g.tiendas.map((id) => tiendas[id] ?? id).join(", ")}</td>
                  <td>{NOMBRE_DISPOSITIVO[g.dispositivo]}</td>
                  <td className="num">{duracion(g.fin - g.inicio)}</td>
                  <td style={{ maxWidth: "18rem" }}>
                    {g.pantallas.slice(0, 4).join(", ")}
                    {g.pantallas.length > 4 ? ` y ${g.pantallas.length - 4} más` : ""}
                  </td>
                  <td className="num">{peso(g.bytes)}</td>
                  <td>
                    <Link className="adm-btn adm-btn--secundario adm-btn--chico" to={`/admin/uso/grabaciones/${g.sesionId}`}>
                      Ver
                    </Link>
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

/** Qué se graba. Lo ve cualquier admin; solo un super admin lo cambia. */
function ConfigGrabacion() {
  const esSuper = useEsSuperAdmin();
  const [config, setConfig] = useState<UsoConfig | null>(null);
  const [porcentaje, setPorcentaje] = useState("");
  const [diasI, setDiasI] = useState("");
  const [diasG, setDiasG] = useState("");
  const [correo, setCorreo] = useState("");
  const [dias, setDias] = useState<1 | 3 | 7>(3);
  const [correos, setCorreos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  function aplicar(c: UsoConfig) {
    setConfig(c);
    setPorcentaje(String(c.porcentajeGrabacion));
    setDiasI(String(c.diasInteracciones));
    setDiasG(String(c.diasGrabaciones));
  }

  useEffect(() => {
    adminGetUsoConfigCallable()
      .then((r) => aplicar(r.data))
      .catch(() => setMensaje({ ok: false, texto: "No se pudo leer la configuración." }));
    if (esSuper) {
      // Los correos invitados a las tiendas, para elegir sin teclearlos completos.
      adminListConcesionariosCallable()
        .then((r) =>
          setCorreos(
            [...new Set(r.data.concesionarios.flatMap((c) => [...c.usuarios, ...(c.vendedores ?? [])]))].sort(),
          ),
        )
        .catch(() => {});
    }
  }, [esSuper]);

  async function guardar(cambio: Parameters<typeof adminSetUsoConfigCallable>[0], ok: string) {
    setGuardando(true);
    setMensaje(null);
    try {
      const { data } = await adminSetUsoConfigCallable(cambio);
      aplicar(data);
      setMensaje({ ok: true, texto: ok });
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  }

  if (!config) return mensaje ? <Notice tono="error">{mensaje.texto}</Notice> : null;

  if (!esSuper) {
    return (
      <Notice titulo="Qué se graba">
        <p>
          El {config.porcentajeGrabacion} % de las sesiones al azar
          {config.grabarHasta.length > 0 &&
            `, y todas las de ${config.grabarHasta.map((g) => g.email).join(", ")} por unos días`}
          . Las grabaciones se guardan {config.diasGrabaciones} días. Solo un super admin cambia esto.
        </p>
      </Notice>
    );
  }

  return (
    <div className="adm-grid uso-grid-2">
      <Card
        titulo="Qué se graba"
        descripcion="Un porcentaje de las sesiones, al azar. Una sesión grabada pesa unos cuantos KB por minuto; el resto de la medición sigue igual aunque esté en 0 %."
        pie={
          <>
            {mensaje && <MensajeInline ok={mensaje.ok}>{mensaje.texto}</MensajeInline>}
            <button
              type="button"
              className="adm-btn adm-btn--primario"
              disabled={guardando}
              onClick={() =>
                void guardar(
                  {
                    porcentajeGrabacion: Number(porcentaje),
                    diasInteracciones: Number(diasI),
                    diasGrabaciones: Number(diasG),
                  },
                  "Guardado",
                )
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <div className="uso-campos">
          <Field label="Sesiones grabadas al azar (%)" htmlFor="uso-pct">
            <input id="uso-pct" type="number" min={0} max={100} value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
          </Field>
          <Field label="Días que se guardan los eventos" htmlFor="uso-di">
            <input id="uso-di" type="number" min={7} max={730} value={diasI} onChange={(e) => setDiasI(e.target.value)} />
          </Field>
          <Field label="Días que se guardan las grabaciones" htmlFor="uso-dg">
            <input id="uso-dg" type="number" min={7} max={730} value={diasG} onChange={(e) => setDiasG(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        titulo="Grabar a una persona"
        descripcion="Todas sus sesiones, por unos días: para ver qué le pasa a una tienda que reporta un problema."
      >
        <form
          className="uso-filtros"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar({ grabar: { email: correo.trim().toLowerCase(), dias } }, `Se grabará a ${correo.trim()} ${dias === 1 ? "1 día" : `${dias} días`}.`).then(() => setCorreo(""));
          }}
        >
          <input
            type="email"
            required
            list="uso-correos"
            aria-label="Correo"
            placeholder="correo@tienda.com"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
          <datalist id="uso-correos">
            {correos.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <select aria-label="Por cuántos días" value={dias} onChange={(e) => setDias(Number(e.target.value) as 1 | 3 | 7)}>
            <option value={1}>1 día</option>
            <option value={3}>3 días</option>
            <option value={7}>7 días</option>
          </select>
          <button type="submit" className="adm-btn adm-btn--secundario" disabled={guardando}>
            Grabar
          </button>
        </form>
        {config.grabarHasta.length > 0 ? (
          <ul className="uso-lista">
            {config.grabarHasta.map((g) => (
              <li key={g.email}>
                <span>
                  <strong>{g.email}</strong> hasta el {fechaHora(g.hasta)}
                </span>
                <button
                  type="button"
                  className="adm-btn adm-btn--texto adm-btn--chico"
                  disabled={guardando}
                  onClick={() => void guardar({ grabar: { email: g.email, dias: 0 } }, `Ya no se graba a ${g.email}.`)}
                >
                  Dejar de grabar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adm-field__ayuda">No hay nadie marcado.</p>
        )}
      </Card>
    </div>
  );
}
