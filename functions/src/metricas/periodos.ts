/**
 * Los periodos de Métricas y contra qué se comparan, en hora de la Ciudad
 * de México.
 *
 * - Semanas (lunes a domingo) y quincenas (1–15 y 16–fin de mes) de
 *   calendario: una semana cerrada siempre da los mismos números, y se
 *   pueden comparar entre reuniones.
 *   - "Esta semana" / "Esta quincena" van del inicio hasta ahora, y se
 *     comparan contra el mismo tramo del periodo anterior (lunes a martes
 *     contra lunes a martes), no contra el periodo completo: si no, el
 *     periodo en curso siempre se vería peor.
 *   - "Semana pasada" / "Quincena pasada" son completas y se comparan
 *     contra la completa de antes.
 * - Los demás (30, 90, 180 y 365 días) son ventanas que terminan ahora y se
 *   comparan contra la ventana de la misma duración justo antes.
 */

export const PERIODOS = [
  "semana",
  "semana-pasada",
  "quincena",
  "quincena-pasada",
  "30",
  "90",
  "180",
  "365",
] as const;
export type Periodo = (typeof PERIODOS)[number];

export interface Rango {
  /** Epoch ms, incluido. */
  desde: number;
  /** Epoch ms, excluido. */
  hasta: number;
}

const ZONA = "America/Mexico_City";
const DIA_MS = 86_400_000;

const partes = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

/** Año, mes (1–12), día y día de la semana (0 = domingo) de un instante en México. */
function fechaMx(ms: number): { anio: number; mes: number; dia: number; semana: number } {
  const p = Object.fromEntries(partes.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const anio = Number(p.year);
  const mes = Number(p.month);
  const dia = Number(p.day);
  return { anio, mes, dia, semana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() };
}

/**
 * El instante en que empieza un día en México. Se calcula la diferencia con
 * UTC de ese día en vez de fijar -6, por si la zona vuelve a cambiar.
 * Acepta días fuera de rango (día 0, mes 13…) igual que Date.UTC.
 */
export function inicioDelDia(anio: number, mes: number, dia: number): number {
  const utc = Date.UTC(anio, mes - 1, dia);
  const p = Object.fromEntries(partes.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return utc - (comoUtc - utc);
}

function inicioDeSemana(ms: number): number {
  const f = fechaMx(ms);
  const desdeLunes = (f.semana + 6) % 7;
  return inicioDelDia(f.anio, f.mes, f.dia - desdeLunes);
}

/** La quincena que contiene a `ms`: [inicio, fin). */
function quincena(ms: number): Rango {
  const f = fechaMx(ms);
  return f.dia <= 15
    ? { desde: inicioDelDia(f.anio, f.mes, 1), hasta: inicioDelDia(f.anio, f.mes, 16) }
    : { desde: inicioDelDia(f.anio, f.mes, 16), hasta: inicioDelDia(f.anio, f.mes + 1, 1) };
}

export function resolverPeriodo(periodo: Periodo, ahoraDate: Date): { actual: Rango; anterior: Rango } {
  const ahora = ahoraDate.getTime();
  switch (periodo) {
    case "semana": {
      const desde = inicioDeSemana(ahora);
      // Una semana atrás desde el mismo lunes: sin cambio de horario en
      // México, siete días son siempre 7 × 24 h.
      const antes = desde - 7 * DIA_MS;
      return { actual: { desde, hasta: ahora }, anterior: { desde: antes, hasta: antes + (ahora - desde) } };
    }
    case "semana-pasada": {
      const hasta = inicioDeSemana(ahora);
      const desde = hasta - 7 * DIA_MS;
      return { actual: { desde, hasta }, anterior: { desde: desde - 7 * DIA_MS, hasta: desde } };
    }
    case "quincena": {
      const actual = { desde: quincena(ahora).desde, hasta: ahora };
      const previa = quincena(actual.desde - 1);
      return {
        actual,
        anterior: { desde: previa.desde, hasta: Math.min(previa.hasta, previa.desde + (ahora - actual.desde)) },
      };
    }
    case "quincena-pasada": {
      const actual = quincena(quincena(ahora).desde - 1);
      return { actual, anterior: quincena(actual.desde - 1) };
    }
    default: {
      const dias = Number(periodo);
      const desde = ahora - dias * DIA_MS;
      return { actual: { desde, hasta: ahora }, anterior: { desde: desde - dias * DIA_MS, hasta: desde } };
    }
  }
}

export function esPeriodo(v: unknown): v is Periodo {
  return typeof v === "string" && (PERIODOS as readonly string[]).includes(v);
}
