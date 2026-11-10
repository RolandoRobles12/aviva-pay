import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useParams } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useConcesionario } from "./ConcesionarioLayout";
import {
  CapacitacionProvider,
  useCapacitacion,
  type CapacitacionContexto,
} from "../capacitacion/contexto";
import { getLeccion } from "../capacitacion/lecciones";
import { CURSO_TIENDA, CURSO_VENDEDOR, type Curso } from "../capacitacion/cursos";
import { calcularAvance, leccionSiguiente, numeroDeLeccion } from "../capacitacion/progreso";
import { GuiaRapida } from "../capacitacion/referencia";
import { useVendedor } from "./VendedorPage";
import "../styles/capacitacion.css";

/* --- Envolturas ---------------------------------------------------------- */

/** Dentro del portal: nombres de columna de esta tienda y avance guardado en el servidor. */
export function AprendeTiendaLayout() {
  const { labels, origenDisposicion, capacitacion, marcarLeccion } = useConcesionario();
  const ctx: CapacitacionContexto = useMemo(
    () => ({
      modo: "tienda",
      curso: CURSO_TIENDA,
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

/** Dentro de /consulta: el curso del vendedor, con su avance guardado. */
export function AprendeVendedorLayout() {
  const { capacitacion, marcarLeccion } = useVendedor();
  const ctx: CapacitacionContexto = useMemo(
    () => ({
      modo: "tienda",
      curso: CURSO_VENDEDOR,
      base: "/consulta/aprende",
      completadas: capacitacion?.completadas ?? [],
      marcarCompletada: marcarLeccion,
      labels: {},
      origenDisposicion: "paydesk",
    }),
    [capacitacion, marcarLeccion],
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
  curso: CURSO_TIENDA,
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
export function AyudaPublicaLayout({ curso = CURSO_TIENDA, base = "/ayuda" }: { curso?: Curso; base?: string }) {
  const ctx = useMemo(() => ({ ...CTX_PUBLICO, curso, base }), [curso, base]);
  return (
    <CapacitacionProvider value={ctx}>
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
  const { modo, base, completadas, curso } = useCapacitacion();
  const avance = calcularAvance(completadas, curso.orden);
  const siguiente = avance.siguiente ? getLeccion(avance.siguiente, curso.lecciones) : null;
  const { Referencia } = curso;

  return (
    <>
      <section className="cap-hero">
        <div>
          <h1>Aprende a usar Paydesk</h1>
          <p>
            {curso.lecciones.length} lecciones cortas, unos {curso.minutos} minutos en
            total. {curso.promesa}
          </p>
          {modo === "publico" && (
            <p className="cap-hero__nota">
              Estás viendo la versión abierta. <Link to="/">Entra con tu cuenta</Link>{" "}
              y búscala en la pestaña “Aprende” para que tu avance quede guardado.
              ¿Es otro tu perfil? <Link to="/conoce">Elige tu guía</Link>.
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
          ) : curso.id === "tienda" ? (
            <Link to={`${base}/guia-rapida`} className="cap-boton cap-boton--secundario">
              Ver la guía rápida
            </Link>
          ) : null}
        </div>
      </section>

      <ol className="cap-lista">
        {curso.lecciones.map((l, i) => {
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

      <Referencia />
    </>
  );
}

/* --- Lección ------------------------------------------------------------- */

export function AprendeLeccion() {
  const { leccionId } = useParams();
  const { modo, base, completadas, marcarCompletada, curso } = useCapacitacion();
  const leccion = getLeccion(leccionId, curso.lecciones);
  const [aprobadaAhora, setAprobadaAhora] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  // Cada lección empieza arriba y con su práctica limpia, también al pasar
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

  const { Contenido, Practica } = leccion;
  const numero = numeroDeLeccion(leccion.id, curso.orden);
  const siguiente = leccionSiguiente(leccion.id, curso.orden);
  const anterior = curso.orden[numero - 2];
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
          Lección {numero} de {curso.orden.length} · {leccion.minutos} min
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

      {Practica ? (
        <section className="cap-seccion cap-seccion--practica" id="practica">
          <h2>Ahora hazlo tú</h2>
          <p>
            {yaHecha && modo === "tienda"
              ? "Ya completaste esta práctica. Puedes repetirla cuando quieras."
              : "Cumple las misiones para completar la lección. Son las mismas pantallas que vas a usar, con clientes inventados: equivócate todo lo que quieras."}
          </p>
          <Practica key={leccion.id} onCompletado={aprobado} />
        </section>
      ) : (
        !aprobadaAhora &&
        !(yaHecha && modo === "tienda") && (
          <div className="cap-entendido">
            <button type="button" className="cap-boton" onClick={aprobado}>
              Entendido{siguiente ? ", siguiente lección" : ""}
            </button>
          </div>
        )
      )}

      {/* El cierre sale al terminar la práctica en esta visita; al repasar una ya hecha no estorba. */}
      {aprobadaAhora && (
        <div className="cap-logro" role="status">
          <strong>
            {modo === "tienda" ? "¡Lección completada!" : "¡Listo!"}
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
              Siguiente: {getLeccion(siguiente, curso.lecciones)?.titulo} →
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
          <Link to={`${base}/${anterior}`}>← {getLeccion(anterior, curso.lecciones)?.titulo}</Link>
        ) : (
          <span />
        )}
        {siguiente && <Link to={`${base}/${siguiente}`}>{getLeccion(siguiente, curso.lecciones)?.titulo} →</Link>}
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
