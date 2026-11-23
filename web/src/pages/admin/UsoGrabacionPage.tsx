import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  adminBorrarGrabacionCallable,
  adminGetGrabacionCallable,
  type GrabacionDetalle,
  type MomentoGrabacion,
} from "../../lib/firebase";
import { cargarPedazos, cargarRrweb } from "../../lib/reproductor";
import { useEsSuperAdmin } from "../../lib/adminRol";
import { Badge, Card, Cargando, Notice, PageHeader } from "../../components/admin/ui";
import { fechaHora } from "./UsoPage";
import { duracion } from "./UsoGrabacionesPage";

type Replayer = InstanceType<Awaited<ReturnType<typeof cargarRrweb>>["Replayer"]>;

const VELOCIDADES = [1, 2, 4, 8];

const TONO_MOMENTO: Record<MomentoGrabacion["tipo"], "ok" | "warn" | "error" | "neutro"> = {
  guardado: "ok",
  venta: "ok",
  frustracion: "warn",
  codigo: "warn",
  senal: "neutro",
  rechazo: "error",
  error: "error",
};

const NOMBRE_MOMENTO: Record<MomentoGrabacion["tipo"], string> = {
  guardado: "Documento",
  venta: "Venta",
  frustracion: "Frustración",
  codigo: "Código",
  senal: "Señal",
  rechazo: "Documento",
  error: "Error",
};

function reloj(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Reproductor de una sesión grabada. Reconstruye la pantalla con rrweb
 * (no es video) y marca en la línea de tiempo los momentos clave —
 * frustración, errores, documentos guardados o rechazados, ventas con
 * código — para saltar directo a ellos.
 */
export function UsoGrabacionPage() {
  const { sesionId = "" } = useParams();
  const navigate = useNavigate();
  const esSuper = useEsSuperAdmin();
  const [detalle, setDetalle] = useState<GrabacionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ listos: number; total: number } | null>(null);
  const [listo, setListo] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [actual, setActual] = useState(0);
  const [total, setTotal] = useState(0);
  /** Reloj del servidor del primer evento: con él se ubican los momentos en la línea de tiempo. */
  const [base, setBase] = useState(0);
  const marco = useRef<HTMLDivElement>(null);
  const escenario = useRef<HTMLDivElement>(null);
  const replayer = useRef<Replayer | null>(null);
  const tamano = useRef({ ancho: 1280, alto: 800 });

  const ajustar = useCallback(() => {
    const m = marco.current;
    const r = replayer.current;
    if (!m || !r) return;
    const { ancho, alto } = tamano.current;
    const escala = Math.min(1, m.clientWidth / ancho);
    r.wrapper.style.transform = `scale(${escala})`;
    r.wrapper.style.transformOrigin = "top left";
    m.style.height = `${alto * escala}px`;
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await adminGetGrabacionCallable({ sesionId });
        if (cancelado) return;
        setDetalle(data);
        const ns = data.fragmentos.map((f) => f.n);
        setAvance({ listos: 0, total: ns.length });
        const [{ eventos, fragmentos }, { Replayer }] = await Promise.all([
          cargarPedazos(sesionId, ns, (listos, t) => !cancelado && setAvance({ listos, total: t })),
          cargarRrweb(),
        ]);
        if (cancelado || !escenario.current) return;
        if (eventos.length === 0) {
          setError("No se pudo leer ningún pedazo de esta grabación.");
          return;
        }
        tamano.current = { ancho: fragmentos[0]?.ancho ?? 1280, alto: fragmentos[0]?.alto ?? 800 };
        const r = new Replayer(eventos as never, {
          root: escenario.current,
          skipInactive: true,
          showWarning: false,
          mouseTail: false,
          triggerFocus: false,
          speed: 1,
        });
        r.on("resize", (d) => {
          const dim = d as { width: number; height: number };
          tamano.current = { ancho: dim.width, alto: dim.height };
          ajustar();
        });
        r.on("finish", () => setReproduciendo(false));
        replayer.current = r;
        setTotal(r.getMetaData().totalTime);
        setBase(fragmentos[0]?.inicio ?? data.inicio);
        r.pause(0);
        ajustar();
        setListo(true);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo cargar la grabación.");
      }
    })();
    return () => {
      cancelado = true;
      replayer.current?.destroy();
      replayer.current = null;
    };
  }, [sesionId, ajustar]);

  useEffect(() => {
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [ajustar]);

  // La posición del reproductor, para la barra y el reloj.
  useEffect(() => {
    if (!reproduciendo) return;
    let raf = 0;
    const tick = () => {
      if (replayer.current) setActual(replayer.current.getCurrentTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reproduciendo]);

  function ir(ms: number, reproducir = reproduciendo) {
    const r = replayer.current;
    if (!r) return;
    const t = Math.max(0, Math.min(total, ms));
    if (reproducir) r.play(t);
    else r.pause(t);
    setActual(t);
    setReproduciendo(reproducir);
  }

  function alternar() {
    const r = replayer.current;
    if (!r) return;
    if (reproduciendo) {
      r.pause();
      setReproduciendo(false);
    } else {
      r.play(actual >= total ? 0 : actual);
      setReproduciendo(true);
    }
  }

  function cambiarVelocidad(v: number) {
    setVelocidad(v);
    replayer.current?.setConfig({ speed: v });
  }

  async function borrar() {
    if (!window.confirm("¿Borrar esta grabación? No se puede deshacer.")) return;
    try {
      await adminBorrarGrabacionCallable({ sesionId });
      navigate("/admin/uso/grabaciones", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  }

  const momentos = (detalle?.momentos ?? []).map((m) => ({ ...m, t: m.en - base }));

  return (
    <section>
      <PageHeader
        titulo="Sesión grabada"
        volver={{ to: "/admin/uso/grabaciones", label: "Grabaciones" }}
        descripcion={
          detalle
            ? `${detalle.email ?? "—"} · ${fechaHora(detalle.inicio)} · ${duracion(detalle.fin - detalle.inicio)}`
            : undefined
        }
        acciones={
          esSuper && detalle ? (
            <button type="button" className="adm-btn adm-btn--peligro adm-btn--chico" onClick={() => void borrar()}>
              Borrar grabación
            </button>
          ) : undefined
        }
      />

      {error && <Notice tono="error">{error}</Notice>}
      {!listo && !error && (
        <Cargando
          texto={avance && avance.total > 0 ? `Cargando la grabación (${avance.listos} de ${avance.total} minutos)...` : "Cargando..."}
        />
      )}

      <div className="uso-reproductor" hidden={!listo}>
        <div className="uso-reproductor__marco" ref={marco}>
          <div ref={escenario} />
        </div>
        <div className="uso-reproductor__controles">
          <button type="button" className="adm-btn adm-btn--primario adm-btn--chico" onClick={alternar}>
            {reproduciendo ? "Pausa" : "Reproducir"}
          </button>
          <span className="uso-reproductor__reloj">
            {reloj(actual)} / {reloj(total)}
          </span>
          <div className="uso-reproductor__linea">
            <input
              type="range"
              aria-label="Posición"
              min={0}
              max={Math.max(1, total)}
              value={actual}
              onChange={(e) => ir(Number(e.target.value))}
            />
            {momentos
              .filter((m) => m.t >= 0 && m.t <= total)
              .map((m, i) => (
                <button
                  key={i}
                  type="button"
                  className={`uso-reproductor__marca uso-reproductor__marca--${TONO_MOMENTO[m.tipo]}`}
                  style={{ left: `${(m.t / Math.max(1, total)) * 100}%` }}
                  title={`${reloj(m.t)} · ${m.texto}`}
                  aria-label={`Ir a ${m.texto}`}
                  onClick={() => ir(m.t - 2000, true)}
                />
              ))}
          </div>
          <select aria-label="Velocidad" value={velocidad} onChange={(e) => cambiarVelocidad(Number(e.target.value))}>
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </div>
        <p className="adm-field__ayuda">
          Lo escrito sale como ****, los nombres y montos de clientes van tapados y la cámara no se graba. Los ratos
          sin actividad se saltan solos.
        </p>
      </div>

      {detalle && listo && (
        <div className="adm-grid uso-grid-2">
          <Card titulo="Momentos clave" descripcion="Toca uno para verlo (empieza 2 s antes).">
            {momentos.length === 0 ? (
              <p className="adm-field__ayuda">Nada fuera de lo normal en esta sesión.</p>
            ) : (
              <ul className="uso-lista">
                {momentos.map((m, i) => (
                  <li key={i}>
                    <button type="button" className="adm-btn adm-btn--texto adm-btn--chico" onClick={() => ir(m.t - 2000, true)}>
                      {reloj(Math.max(0, m.t))}
                    </button>
                    <Badge tono={TONO_MOMENTO[m.tipo]}>{NOMBRE_MOMENTO[m.tipo]}</Badge>
                    <span>{m.texto}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card titulo="Datos de la sesión">
            <dl className="uso-datos">
              <dt>Persona</dt>
              <dd>
                {detalle.email ?? "—"} ({detalle.perfil === "tienda" ? "personal de tienda" : "asesor de ventas"})
              </dd>
              <dt>Equipo</dt>
              <dd>
                {detalle.dispositivo} · {tamano.current.ancho}×{tamano.current.alto}
              </dd>
              <dt>Por qué se grabó</dt>
              <dd>{detalle.elegida ? "Se eligió a esta persona" : "Al azar"}</dd>
              <dt>Pedazos</dt>
              <dd>
                {detalle.fragmentos.length} de ~1 min
              </dd>
              <dt>Pantallas</dt>
              <dd>{[...new Set(detalle.fragmentos.flatMap((f) => f.pantallas))].join(", ")}</dd>
            </dl>
          </Card>
        </div>
      )}
    </section>
  );
}
