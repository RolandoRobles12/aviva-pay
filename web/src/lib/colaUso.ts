/**
 * La cola de eventos de uso que espera en el equipo (localStorage) hasta
 * que se pueden mandar. Funciones puras, sin almacenamiento ni red, para
 * probarlas (web/test/analitica.test.ts); quien lee y escribe es
 * analitica.ts.
 *
 * Cada lote recibe un id al armarse y sus eventos lo guardan (`l`). Si el
 * envío falla, el siguiente intento vuelve a mandar exactamente ese lote,
 * con el mismo id, y el servidor lo ignora si ya lo tenía: un lote nunca
 * se guarda dos veces aunque la respuesta se pierda.
 */

export interface EnCola<E extends { en: number } = { en: number }> {
  /** id local del evento */
  i: string;
  /** uid de quien lo generó */
  u: string;
  /** sesión */
  s: string;
  /** dispositivo */
  d: string;
  /** lote al que ya se asignó (se reenvía tal cual) */
  l?: string;
  e: E;
}

export interface Lote<E extends { en: number }> {
  id: string;
  sesionId: string;
  dispositivo: string;
  eventos: EnCola<E>[];
}

/**
 * Agrega lo nuevo a la cola y la recorta: lo de otra persona se guarda
 * hasta 7 días (por si vuelve a entrar en este equipo) y, si no cabe, se
 * van los más viejos.
 */
export function podar<E extends { en: number }>(
  cola: EnCola<E>[],
  uidActual: string | null,
  ahora: number,
  { max, viejoMs }: { max: number; viejoMs: number },
): EnCola<E>[] {
  return cola.filter((g) => g.u === uidActual || ahora - g.e.en < viejoMs).slice(-max);
}

/**
 * Los lotes por mandar de `uid`: primero los ya armados (reintentos, con
 * su id de siempre), luego lotes nuevos con lo que no tenga lote, por
 * sesión y de a lo más `maxLote`. Devuelve la cola con los ids asignados,
 * para guardarla *antes* de mandar.
 */
export function armarLotes<E extends { en: number }>(
  cola: EnCola<E>[],
  uid: string,
  maxLote: number,
  nuevoId: () => string,
): { cola: EnCola<E>[]; lotes: Lote<E>[] } {
  const lotes = new Map<string, Lote<E>>();
  const abiertos = new Map<string, Lote<E>>();
  const salida = cola.map((g) => {
    if (g.u !== uid) return g;
    if (g.l) {
      const lote = lotes.get(g.l) ?? { id: g.l, sesionId: g.s, dispositivo: g.d, eventos: [] };
      lote.eventos.push(g);
      lotes.set(g.l, lote);
      return g;
    }
    let lote = abiertos.get(g.s);
    if (!lote || lote.eventos.length >= maxLote) {
      lote = { id: nuevoId(), sesionId: g.s, dispositivo: g.d, eventos: [] };
      abiertos.set(g.s, lote);
      lotes.set(lote.id, lote);
    }
    const asignado = { ...g, l: lote.id };
    lote.eventos.push(asignado);
    return asignado;
  });
  return { cola: salida, lotes: [...lotes.values()] };
}

/**
 * La cola sin los eventos de un lote que el servidor ya confirmó. Por id
 * de lote y también por id de evento: si otra pestaña reescribió la cola
 * mientras tanto y les borró el lote asignado, igual se quitan.
 */
export function quitarLote<E extends { en: number }>(cola: EnCola<E>[], lote: Lote<E>): EnCola<E>[] {
  const ids = new Set(lote.eventos.map((g) => g.i));
  return cola.filter((g) => g.l !== lote.id && !ids.has(g.i));
}
