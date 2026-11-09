import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCapacitacion } from "./contexto";
import { LECCIONES, MINUTOS_TOTALES, type Leccion } from "./lecciones";
import { LECCIONES_VENDEDOR, MINUTOS_VENDEDOR, PREGUNTAS_VENDEDOR } from "./leccionesVendedor";
import { ORDEN_LECCIONES, ORDEN_VENDEDOR, type Orden } from "./progreso";
import { CuandoLlamar, PreguntasFrecuentes } from "./referencia";

/**
 * Un curso: sus lecciones en orden y lo que va al pie de su inicio
 * (preguntas frecuentes y demás material de consulta). Hay uno por perfil
 * —personal con acceso completo, y vendedor— y la misma pantalla
 * (AprendePage) pinta cualquiera de los dos.
 */
export interface Curso {
  id: "tienda" | "vendedor";
  lecciones: Leccion[];
  orden: Orden;
  minutos: number;
  /** Qué sabrá hacer al terminar, para el encabezado del inicio. */
  promesa: string;
  Referencia: () => ReactNode;
}

function ReferenciaTienda() {
  const { base } = useCapacitacion();
  return (
    <>
      <section className="cap-bloque">
        <h2>Para tener a la mano en la caja</h2>
        <div className="cap-atajos">
          <Link to={`${base}/guia-rapida`} className="cap-atajo">
            <strong>Guía rápida para imprimir</strong>
            <span>Una hoja con tus tres tareas y qué hacer con cada respuesta del código.</span>
          </Link>
          <Link to={`${base}/validar-codigo#practica`} className="cap-atajo">
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

function ReferenciaVendedor() {
  return (
    <section className="cap-bloque">
      <h2>Preguntas frecuentes</h2>
      <PreguntasFrecuentes
        preguntas={PREGUNTAS_VENDEDOR}
        placeholder="Busca tu duda: no veo a un cliente, vale, contraseña…"
      />
    </section>
  );
}

export const CURSO_TIENDA: Curso = {
  id: "tienda",
  lecciones: LECCIONES,
  orden: ORDEN_LECCIONES,
  minutos: MINUTOS_TOTALES,
  promesa:
    "Al terminar sabrás hacer tus tres tareas y resolver por tu cuenta lo que hoy te haría llamar a Aviva.",
  Referencia: ReferenciaTienda,
};

export const CURSO_VENDEDOR: Curso = {
  id: "vendedor",
  lecciones: LECCIONES_VENDEDOR,
  orden: ORDEN_VENDEDOR,
  minutos: MINUTOS_VENDEDOR,
  promesa:
    "Al terminar sabrás qué significa cada etapa del crédito y qué seguimiento darle a cada cliente para cerrar la venta.",
  Referencia: ReferenciaVendedor,
};
