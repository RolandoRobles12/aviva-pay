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

/**
 * El curso del vendedor: lo que ve en /consulta y cómo dar seguimiento.
 * Copia de ORDEN_VENDEDOR en web/src/capacitacion/progreso.ts.
 */
export const LECCIONES_VENDEDOR = [
  "vendedor-inicio",
  "vendedor-etapas",
  "vendedor-seguimiento",
] as const;

/**
 * Cada persona toma el curso de su perfil (un correo es personal con
 * acceso completo o vendedor, nunca las dos cosas).
 */
export type Curso = "tienda" | "vendedor";

export const LECCIONES_POR_CURSO: Record<Curso, readonly string[]> = {
  tienda: LECCIONES_CAPACITACION,
  vendedor: LECCIONES_VENDEDOR,
};

export type LeccionId =
  | (typeof LECCIONES_CAPACITACION)[number]
  | (typeof LECCIONES_VENDEDOR)[number];

/** ¿Existe esta lección en ese curso? Por omisión, el de la tienda. */
export function esLeccion(id: unknown, curso: Curso = "tienda"): id is LeccionId {
  return typeof id === "string" && LECCIONES_POR_CURSO[curso].includes(id);
}

export interface ResumenCapacitacion {
  /** Lecciones vigentes que ya pasó, en el orden del curso. */
  completadas: LeccionId[];
  total: number;
  completa: boolean;
}

/**
 * Cuenta solo lecciones que siguen existiendo en el curso: una que se
 * retiró no debe inflar el avance de nadie, y las de otro curso (alguien
 * que cambió de perfil) tampoco cuentan.
 */
export function resumirCapacitacion(guardadas: unknown, curso: Curso = "tienda"): ResumenCapacitacion {
  const lista = Array.isArray(guardadas) ? guardadas : [];
  const orden = LECCIONES_POR_CURSO[curso];
  const completadas = orden.filter((id) => lista.includes(id)) as LeccionId[];
  return {
    completadas,
    total: orden.length,
    completa: completadas.length === orden.length,
  };
}
