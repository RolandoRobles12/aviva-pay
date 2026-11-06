import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useParams } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useConcesionario } from "./ConcesionarioLayout";
import {
  CapacitacionProvider,
  useCapacitacion,
  type CapacitacionContexto,
} from "../capacitacion/contexto";
import { LECCIONES, MINUTOS_TOTALES, getLeccion } from "../capacitacion/lecciones";
import {
  calcularAvance,
  leccionSiguiente,
  numeroDeLeccion,
  ORDEN_LECCIONES,
} from "../capacitacion/progreso";
import { Quiz } from "../capacitacion/Quiz";
import { CuandoLlamar, GuiaRapida, PreguntasFrecuentes } from "../capacitacion/referencia";
import "../styles/capacitacion.css";

/* --- Envolturas ---------------------------------------------------------- */

/** Dentro del portal: nombres de columna de esta tienda y avance guardado en el servidor. */
export function AprendeTiendaLayout() {
  const { labels, origenDisposicion, capacitacion, marcarLeccion } = useConcesionario();
  const ctx: CapacitacionContexto = useMemo(
    () => ({
      modo: "tienda",
      base: "/solicitudes/aprende",
      completadas: capacitacion?.completadas ?? [],
      marcarCompletada: marcarLeccion,
      labels,
      origenDisposicion,
    }),
    [labels, origenDisposicion, capacitacion, marcarLeccion],
  );
  return (
    <CapacitacionProvider value={ctx}>
      <div className="cap">
        <Outlet />
      </div>
    </CapacitacionProvider>
  );
}

const CTX_PUBLICO: CapacitacionContexto = {
  modo: "publico",
  base: "/ayuda",
  completadas: [],
  marcarCompletada: async () => {},
  labels: {},
  // El origen por defecto del sistema (ver /admin/etapas): es lo que ve la
  // mayoría de las tiendas.
  origenDisposicion: "paydesk",
};

/**
 * Sin sesión: la liga que un ejecutivo le manda a una tienda antes de
 * invitarla, y la que abren las ligas de ayuda de los formularios (en otra
 * pestaña, para no perder lo capturado). No guarda avance.
 */
export function AyudaPublicaLayout() {
  return (
    <CapacitacionProvider value={CTX_PUBLICO}>
      <main className="app-shell">
        <header className="app-bar">
          <BrandMark />
          <div className="header-right">
            <Link to="/" className="link-button">
              Entrar a Paydesk
            </Link>
          </div>
        </header>
        <div className="app-body cap">
          <Outlet />
        </div>
      </main>
    </CapacitacionProvider>
  );
}

/* --- Inicio -------------------------------------------------------------- */

function BarraAvance({ hechas, total }: { hechas: number; total: number }) {
  return (
    <div
      className="cap-barra"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={hechas}
      aria-label={`${hechas} de ${total} lecciones completadas`}
    >
      <span className="cap-barra__relleno" style={{ width: `${(hechas / total) * 100}%` }} />
    </div>
  );
}

export function AprendeInicio() {
  const { modo, base, completadas } = useCapacitacion();
  const avance = calcularAvance(completadas);
  const siguiente = avance.siguiente ? getLeccion(avance.siguiente) : null;

  return (
    <>
      <section className="cap-hero">
        <div>
          <h1>Aprende a usar Paydesk</h1>
          <p>
            {LECCIONES.length} lecciones cortas, unos {MINUTOS_TOTALES} minutos en total.
            Al terminar sabrás hacer tus tres tareas y resolver por tu cuenta lo que
            hoy te haría llamar a Aviva.
          </p>
          {modo === "publico" && (
            <p className="cap-hero__nota">
              Estás viendo la versión abierta. <Link to="/">Entra con tu cuenta</Link>{" "}
              y búscala en la pestaña “Aprende” para que tu avance quede guardado.
            </p>
          )}
        </div>

        <div className="cap-hero__avance">
          {modo === "tienda" && (
            <>
              <p className="cap-hero__cifra">
                {avance.completa ? (
                  <span className="cap-completa">✓ Capacitación completa</span>
                ) : (
                  <>
                    <strong>{avance.hechas}</strong> de {avance.total} lecciones
                  </>
                )}
              </p>
              <BarraAvance hechas={avance.hechas} total={avance.total} />
            </>
          )}
          {siguiente ? (
            <Link to={`${base}/${siguiente.id}`} className="cap-boton">
              {avance.hechas === 0 ? "Empezar" : `Continuar: ${siguiente.titulo}`} →
            </Link>
          ) : (
            <Link to={`${base}/guia-rapida`} className="cap-boton cap-boton--secundario">
              Ver la guía rápida
            </Link>
          )}
        </div>
      </section>

      <ol className="cap-lista">
        {LECCIONES.map((l, i) => {
          const hecha = completadas.includes(l.id);
          return (
            <li key={l.id}>
              <Link to={`${base}/${l.id}`} className={`cap-tarjeta${hecha ? " cap-tarjeta--hecha" : ""}`}>
                <span className="cap-tarjeta__num" aria-hidden>
                  {hecha ? "✓" : i + 1}
                </span>
                <span className="cap-tarjeta__texto">
                  <strong>{l.titulo}</strong>
                  <span>{l.resumen}</span>
                </span>
                <span className="cap-tarjeta__meta">
                  {modo === "tienda" && hecha ? "Completada" : `${l.minutos} min`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <section className="cap-bloque">
        <h2>Para tener a la mano en la caja</h2>
        <div className="cap-atajos">
          <Link to={`${base}/guia-rapida`} className="cap-atajo">
            <strong>Guía rápida para imprimir</strong>
            <span>Una hoja con tus tres tareas y qué hacer con cada respuesta del código.</span>
          </Link>
          <Link to={`${base}/validar-codigo#simulador`} className="cap-atajo">
            <strong>Simulador de caja</strong>
            <span>Practica la validación con códigos de prueba, sin tocar clientes reales.</span>
          </Link>
        </div>
      </section>

      <section className="cap-bloque">
        <h2>Preguntas frecuentes</h2>
        <PreguntasFrecuentes />
      </section>

      <section className="cap-bloque">
        <h2>¿Lo resuelvo yo o llamo a Aviva?</h2>
        <p className="cap-bloque__intro">
          Antes de llamar, revisa si es algo que puedes resolver tú en un minuto.
        </p>
        <CuandoLlamar />
      </section>
    </>
  );
}

/* --- Lección ------------------------------------------------------------- */

export function AprendeLeccion() {
  const { leccionId } = useParams();
  const { modo, base, completadas, marcarCompletada } = useCapacitacion();
  const leccion = getLeccion(leccionId);
  const [aprobadaAhora, setAprobadaAhora] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  // Cada lección empieza arriba y con su examen limpio, también al pasar
  // de una a otra con "Siguiente".
  useEffect(() => {
    setAprobadaAhora(false);
    setErrorGuardado(null);
    if (window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [leccionId]);

  if (!leccion) return <Navigate to={base} replace />;

  const { Contenido } = leccion;
  const numero = numeroDeLeccion(leccion.id);
  const siguiente = leccionSiguiente(leccion.id);
  const anterior = ORDEN_LECCIONES[numero - 2];
  const yaHecha = completadas.includes(leccion.id);

  async function guardar() {
    setErrorGuardado(null);
    try {
      await marcarCompletada(leccion!.id);
    } catch {
      setErrorGuardado("No pudimos guardar tu avance. Revisa tu conexión e intenta de nuevo.");
    }
  }

  function aprobado() {
    setAprobadaAhora(true);
    if (!yaHecha) void guardar();
  }

  return (
    <article className="cap-leccion">
      <nav className="cap-leccion__nav">
        <Link to={base}>← Todas las lecciones</Link>
        <span>
          Lección {numero} de {ORDEN_LECCIONES.length} · {leccion.minutos} min
        </span>
      </nav>

      <header className="cap-leccion__head">
        <h1>{leccion.titulo}</h1>
        <p>{leccion.resumen}</p>
        {modo === "tienda" && yaHecha && <span className="cap-completa">✓ Completada</span>}
      </header>

      <div className="cap-leccion__cuerpo">
        <Contenido />
      </div>

      <section className="cap-seccion cap-seccion--quiz" id="examen">
        <h2>Comprueba lo que aprendiste</h2>
        <Quiz key={leccion.id} preguntas={leccion.preguntas} aprobadaAntes={yaHecha} onAprobado={aprobado} />
      </section>

      {/* El cierre sale al pasar el examen en esta visita; al repasar una ya hecha no estorba. */}
      {aprobadaAhora && (
        <div className="cap-logro" role="status">
          <strong>
            {modo === "tienda" ? "¡Lección completada!" : "¡Todo correcto!"}
          </strong>
          {modo === "publico" && (
            <span>
              <Link to="/">Entra con tu cuenta</Link> para que tu avance quede guardado.
            </span>
          )}
          {errorGuardado && (
            <span className="form-error">
              {errorGuardado}{" "}
              <button type="button" className="link-button" onClick={() => void guardar()}>
                Reintentar
              </button>
            </span>
          )}
          {siguiente ? (
            <Link to={`${base}/${siguiente}`} className="cap-boton">
              Siguiente: {getLeccion(siguiente)?.titulo} →
            </Link>
          ) : (
            <Link to={base} className="cap-boton">
              Terminar →
            </Link>
          )}
        </div>
      )}

      <nav className="cap-leccion__pie">
        {anterior ? (
          <Link to={`${base}/${anterior}`}>← {getLeccion(anterior)?.titulo}</Link>
        ) : (
          <span />
        )}
        {siguiente && <Link to={`${base}/${siguiente}`}>{getLeccion(siguiente)?.titulo} →</Link>}
      </nav>
    </article>
  );
}

/* --- Guía rápida --------------------------------------------------------- */

export function AprendeGuiaRapida() {
  const { base } = useCapacitacion();
  return (
    <>
      <nav className="cap-leccion__nav cap-no-imprimir">
        <Link to={base}>← Todas las lecciones</Link>
      </nav>
      <GuiaRapida />
    </>
  );
}
