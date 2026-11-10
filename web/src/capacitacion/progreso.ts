/**
 * Orden del curso. Los ids tienen que coincidir con
 * LECCIONES_CAPACITACION en functions/src/capacitacion/lecciones.ts, que
 * es la lista contra la que el backend acepta avances (hay una prueba que
 * lo revisa). El contenido de cada una vive en lecciones.tsx.
 */
export const ORDEN_LECCIONES = ["tienda-inicio", "mis-clientes", "documentos", "validar-codigo"] as const;

/**
 * El curso del vendedor (personal que solo vende). Tiene que coincidir con
 * LECCIONES_VENDEDOR en el backend; también lo revisa una prueba.
 */
export const ORDEN_VENDEDOR = ["asesor-inicio", "asesor-etapas", "asesor-seguimiento"] as const;

export type LeccionId = (typeof ORDEN_LECCIONES)[number] | (typeof ORDEN_VENDEDOR)[number];

/** El orden de un curso. Por omisión, el de la tienda. */
export type Orden = readonly LeccionId[];

export function esLeccionId(id: string | undefined, orden: Orden = ORDEN_LECCIONES): id is LeccionId {
  return id !== undefined && (orden as readonly string[]).includes(id);
}

export interface Avance {
  hechas: number;
  total: number;
  /** 0–100, redondeado. */
  porcentaje: number;
  completa: boolean;
  /** La primera lección sin pasar, en el orden del curso; null si ya terminó. */
  siguiente: LeccionId | null;
}

/**
 * Cuánto lleva alguien, contando solo lecciones que existen: un id viejo
 * guardado no debe sumar.
 */
export function calcularAvance(completadas: readonly string[], orden: Orden = ORDEN_LECCIONES): Avance {
  const hechas = orden.filter((id) => completadas.includes(id)).length;
  const total = orden.length;
  return {
    hechas,
    total,
    porcentaje: Math.round((hechas / total) * 100),
    completa: hechas === total,
    siguiente: orden.find((id) => !completadas.includes(id)) ?? null,
  };
}

/** La que sigue a `id` en el curso, para el botón "Siguiente lección". */
export function leccionSiguiente(id: LeccionId, orden: Orden = ORDEN_LECCIONES): LeccionId | null {
  const i = orden.indexOf(id);
  return orden[i + 1] ?? null;
}

export function numeroDeLeccion(id: LeccionId, orden: Orden = ORDEN_LECCIONES): number {
  return orden.indexOf(id) + 1;
}

/** Quita acentos y mayúsculas, para que buscar "codigo" encuentre "código". */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿La pregunta frecuente contiene todas las palabras buscadas? */
export function coincideBusqueda(texto: string, busqueda: string): boolean {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const t = normalizarBusqueda(texto);
  return palabras.every((p) => t.includes(p));
}

/** Lo mínimo que el panel sabe del avance de un correo (ver CapacitacionAdmin en lib/firebase.ts). */
export interface AvanceCorreo {
  completadas: number;
  total: number;
}

export interface CapacitacionDeTienda {
  personas: number;
  /** Terminaron el curso vigente completo. */
  completas: number;
  /** Pasaron al menos una lección, sin terminar. */
  enCurso: number;
  /** Nunca pasaron una lección (o nunca entraron). */
  sinEmpezar: number;
}

/**
 * Cómo va la capacitación de la gente de una tienda, para el catálogo de
 * Aviva. Los correos se comparan en minúsculas, igual que los guarda el
 * backend. Un correo sin registro cuenta como "sin empezar": lo normal es
 * que todavía no haya entrado a Paydesk.
 */
export function capacitacionDeTienda(
  usuarios: readonly string[],
  porCorreo: Record<string, AvanceCorreo>,
): CapacitacionDeTienda {
  const r: CapacitacionDeTienda = { personas: usuarios.length, completas: 0, enCurso: 0, sinEmpezar: 0 };
  for (const email of usuarios) {
    const a = porCorreo[email.toLowerCase()];
    if (!a || a.completadas === 0) r.sinEmpezar++;
    else if (a.completadas >= a.total) r.completas++;
    else r.enCurso++;
  }
  return r;
}
