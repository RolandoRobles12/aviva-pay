/**
 * Las lecciones de la capacitación de tiendas (web/src/capacitacion), por
 * id. El contenido vive en el frontend; aquí solo hace falta la lista,
 * para no aceptar ids inventados y para que el panel de Aviva cuente
 * "3 de 8" contra el mismo total que ve la tienda.
 *
 * Copia de LECCIONES en web/src/capacitacion/lecciones.tsx: si se agrega
 * o se quita una lección allá, va aquí también. Agregar una deja a quien
 * ya había terminado en "7 de 8", que es lo correcto: hay algo nuevo que
 * no ha visto.
 */
export const LECCIONES_CAPACITACION = [
  "bienvenida",
  "acceso",
  "mis-clientes",
  "cotizacion",
  "validar-codigo",
  "comprobante",
  "revision",
  "canceladas-reporte",
] as const;

export type LeccionId = (typeof LECCIONES_CAPACITACION)[number];

export function esLeccion(id: unknown): id is LeccionId {
  return typeof id === "string" && (LECCIONES_CAPACITACION as readonly string[]).includes(id);
}

export interface ResumenCapacitacion {
  /** Lecciones vigentes que ya pasó, en el orden del curso. */
  completadas: LeccionId[];
  total: number;
  completa: boolean;
}

/**
 * Cuenta solo lecciones que siguen existiendo: una que se retiró del
 * curso no debe inflar el avance de nadie.
 */
export function resumirCapacitacion(guardadas: unknown): ResumenCapacitacion {
  const lista = Array.isArray(guardadas) ? guardadas : [];
  const completadas = LECCIONES_CAPACITACION.filter((id) => lista.includes(id));
  return {
    completadas,
    total: LECCIONES_CAPACITACION.length,
    completa: completadas.length === LECCIONES_CAPACITACION.length,
  };
}
