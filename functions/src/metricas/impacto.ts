import { mediana } from "./calcular";

/**
 * "Impacto": lo que Paydesk le cambia al negocio, para admins y
 * stakeholders. No es la pantalla de operación (eso es /admin/metricas) ni
 * la de producto (/admin/uso): responde cuatro preguntas —
 *
 * 1. ¿Cuánto crédito se desembolsa? (todos los desembolsos y la venta en caja)
 * 2. ¿Cumple su objetivo de control? (vale validado en caja + comprobante)
 * 3. ¿Los clientes usan su crédito y qué tan rápido? (créditos usados, crédito que no se usó, días)
 * 4. ¿Las tiendas lo adoptan? (tiendas y personas activas, cotizaciones)
 *
 * Cada bloque se calcula para el periodo elegido y para el periodo
 * anterior de la misma duración, para comparar. Todo sale de fechas que ya
 * guarda cada deal, vale y evento, así que se puede calcular hacia atrás
 * sin fotos diarias. Pura (sin Firestore) para poder probarla.
 */

export interface DealImpacto {
  dealId: string;
  concesionarioId: string | null;
  cancelado?: boolean;
  fechaSolicitud: string | null;
  montoAprobado: number | null;
  creditoLiberadoFecha: string | null;
  cotizacionEstatus: "pendiente" | "completado";
  comprobanteEntregaEstatus: "pendiente" | "completado";
  desembolsoFecha: string | null;
  canceladoFecha: string | null;
}

export interface ValeImpacto {
  codigo: string;
  dealId: string;
  concesionarioId: string;
  estado: "emitido" | "utilizado" | "cancelado";
  montoAutorizado: number | null;
  montoDispuesto: number | null;
  /** ISO. */
  emitidoEn: string | null;
  consumidoEn: string | null;
  ultimaLecturaEn: string | null;
  venceEn: string;
  lecturasTotal: number;
  reemplazaA: string | null;
}

export interface TiendaImpacto {
  concesionarioId: string;
  nombre: string;
  /** Fecha de arranque ya resuelta (la de la tienda o la global); null = aún no arranca. */
  rolloutDesde: string | null;
  /** Tiene al menos un correo invitado (personal de tienda). */
  habilitada: boolean;
}

export interface EventoImpacto {
  concesionarioId: string | null;
  resultado: "aceptado" | "en_revision" | "rechazado_auto" | "aprobado_admin" | "rechazado_admin";
  /** ISO. */
  en: string;
}

export interface IntentoImpacto {
  concesionarioId: string | null;
  motivo: "no-existe" | "otra-tienda";
  en: string;
}

export interface ActividadPersona {
  uid: string;
  perfil: "tienda" | "asesor";
  en: string;
}

export interface Monto {
  creditos: number;
  monto: number;
}

export interface BloqueImpacto {
  credito: {
    desembolsado: Monto;
    ticketPromedio: number | null;
    /** Lo que la tienda cobró en caja con vales de Paydesk. */
    ventaEnCaja: number;
    /** De esa venta, lo que pasó del crédito autorizado (lo pagó el cliente aparte). */
    ventaArribaDelCredito: number;
  };
  control: {
    /** Desembolsos de créditos que ya le tocaban a Paydesk (aprobados desde el arranque de su tienda). */
    base: Monto;
    completo: Monto;
    /** Por monto; null sin base. */
    pct: number | null;
    sinVale: Monto;
    sinComprobante: Monto;
    subidasRechazadas: number;
    valesDeOtraTienda: number;
    codigosInexistentes: number;
  };
  /**
   * Solo créditos aprobados desde el arranque de su tienda, igual que el
   * control: los anteriores también reciben vale, pero su venta se cerró
   * fuera de Paydesk y nadie lo iba a escanear.
   */
  uso: {
    /** Mediana de días de aprobación a desembolso de los desembolsados en el periodo. */
    diasADesembolso: number | null;
    /** usados / (usados + sinUsar); null sin ninguno. */
    tasaUso: number | null;
    /** Se desembolsaron o validaron su vale en caja en el periodo. */
    usados: Monto;
    /** Se cancelaron en el periodo sin desembolsarse ni validar su vale. */
    sinUsar: Monto;
    /** De los sin usar: nadie escaneó su vale (o no alcanzó a tener uno). */
    noFueron: Monto;
    /** De los sin usar: alguien escaneó su vale y no terminó en venta. */
    fueronSinComprar: Monto;
  };
  adopcion: {
    tiendasActivas: number;
    tiendasHabilitadas: number;
    /** De los créditos liberados en el periodo (desde el arranque), cuántos tenían cotización. */
    cotizacion: { conCotizacion: number; liberados: number; pct: number | null };
    /** null cuando el periodo cae fuera de lo que se conserva de la medición de uso. */
    personasTienda: number | null;
    personasAsesor: number | null;
  };
}

export interface MesImpacto {
  /** YYYY-MM, hora de la Ciudad de México. */
  mes: string;
  desembolsado: Monto;
  /** Por monto, sobre la base de control de ese mes; null sin base. */
  pctControl: number | null;
}

export interface TiendaFila {
  concesionarioId: string;
  nombre: string;
  desembolsado: Monto;
  pctControl: number | null;
  diasADesembolso: number | null;
  tasaUso: number | null;
  activa: boolean;
}

export interface ResultadoImpacto {
  dias: number;
  actual: BloqueImpacto;
  anterior: BloqueImpacto;
  /** Mediana de días de aprobación a desembolso de los créditos anteriores al arranque, de todo el historial. */
  antesDePaydesk: { diasADesembolso: number | null; creditos: number };
  meses: MesImpacto[];
  tiendas: TiendaFila[];
  /** Habilitadas sin ninguna acción en el periodo, para ir a buscarlas. */
  tiendasSinActividad: string[];
  avisos: {
    /** Ninguna tienda tiene fecha de arranque: no hay base para medir control. */
    sinArranque: boolean;
    /** Desembolsos del periodo sin monto aprobado: el monto se queda corto. */
    desembolsosSinMonto: number;
  };
}

const DIA_MS = 86_400_000;
const ZONA = "America/Mexico_City";
const formatoMes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit" });

function mesDe(iso: string): string {
  return formatoMes.format(new Date(iso)).slice(0, 7);
}

interface Rango {
  desde: number;
  hasta: number;
}

function enRango(iso: string | null | undefined, r: Rango): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= r.desde && t < r.hasta;
}

const cero = (): Monto => ({ creditos: 0, monto: 0 });
const sumar = (m: Monto, monto: number) => {
  m.creditos += 1;
  m.monto += monto;
};
const pctMonto = (parte: Monto, base: Monto): number | null =>
  base.creditos === 0 ? null : base.monto > 0 ? parte.monto / base.monto : parte.creditos / base.creditos;

/**
 * Los datos ya cruzados una sola vez: qué vales tiene cada deal y de qué
 * tienda arranca cada uno. Lo comparten el periodo actual, el anterior,
 * los meses y la tabla por tienda.
 */
class Indice {
  readonly tiendas: Map<string, TiendaImpacto>;
  readonly valesPorDeal = new Map<string, ValeImpacto[]>();

  constructor(
    readonly deals: DealImpacto[],
    readonly vales: ValeImpacto[],
    tiendas: TiendaImpacto[],
  ) {
    this.tiendas = new Map(tiendas.map((t) => [t.concesionarioId, t]));
    for (const v of vales) {
      const lista = this.valesPorDeal.get(v.dealId) ?? [];
      lista.push(v);
      this.valesPorDeal.set(v.dealId, lista);
    }
  }

  /** Misma regla que la tienda (web/src/lib/dealScope.ts): sin arranque, todo es histórico. */
  esDePaydesk(d: DealImpacto): boolean {
    const arranque = this.tiendas.get(d.concesionarioId ?? "")?.rolloutDesde ?? null;
    if (!arranque) return false;
    if (!d.fechaSolicitud) return true;
    return d.fechaSolicitud.slice(0, 10) >= arranque;
  }

  monto(d: DealImpacto): number {
    if (d.montoAprobado != null) return d.montoAprobado;
    const vale = this.valesPorDeal.get(d.dealId)?.find((v) => v.montoAutorizado != null);
    return vale?.montoAutorizado ?? 0;
  }

  conValeUsado(d: DealImpacto): boolean {
    return (this.valesPorDeal.get(d.dealId) ?? []).some((v) => v.estado === "utilizado");
  }

  desembolsados(r: Rango, tienda?: string): DealImpacto[] {
    return this.deals.filter(
      (d) =>
        d.concesionarioId &&
        !d.cancelado &&
        enRango(d.desembolsoFecha, r) &&
        (!tienda || d.concesionarioId === tienda),
    );
  }

  diasADesembolso(deals: DealImpacto[]): number | null {
    const dias: number[] = [];
    for (const d of deals) {
      if (!d.fechaSolicitud || !d.desembolsoFecha) continue;
      const n = (Date.parse(d.desembolsoFecha) - Date.parse(d.fechaSolicitud)) / DIA_MS;
      if (n >= 0) dias.push(n);
    }
    return mediana(dias);
  }

  control(deals: DealImpacto[]) {
    const base = cero();
    const completo = cero();
    const sinVale = cero();
    const sinComprobante = cero();
    for (const d of deals) {
      if (!this.esDePaydesk(d)) continue;
      const m = this.monto(d);
      sumar(base, m);
      const vale = this.conValeUsado(d);
      const comprobante = d.comprobanteEntregaEstatus === "completado";
      if (vale && comprobante) sumar(completo, m);
      if (!vale) sumar(sinVale, m);
      if (!comprobante) sumar(sinComprobante, m);
    }
    return { base, completo, sinVale, sinComprobante, pct: pctMonto(completo, base) };
  }

  /**
   * Si los clientes usan su crédito: de los créditos de Paydesk que se
   * resolvieron en el periodo, cuántos se usaron (se desembolsaron o
   * validaron su vale en caja) y cuántos se cancelaron sin usarse. Un vale
   * vencido no cuenta como crédito perdido mientras el crédito siga vivo:
   * el cliente pudo comprar sin que la tienda escaneara el vale, y eso es
   * falta de control (bloque 2), no crédito sin usar.
   */
  usoDelCredito(r: Rango, tienda?: string) {
    const usados = cero();
    const noFueron = cero();
    const fueronSinComprar = cero();
    for (const d of this.deals) {
      if (!d.concesionarioId || (tienda && d.concesionarioId !== tienda) || !this.esDePaydesk(d)) continue;
      const vales = this.valesPorDeal.get(d.dealId) ?? [];
      const fechasUso = [
        ...(d.cancelado ? [] : [d.desembolsoFecha]),
        ...vales.filter((v) => v.estado === "utilizado").map((v) => v.consumidoEn),
      ]
        .filter((f): f is string => !!f)
        .sort();
      if (fechasUso.length > 0) {
        if (enRango(fechasUso[0], r)) sumar(usados, this.monto(d));
      } else if (d.cancelado && enRango(d.canceladoFecha, r)) {
        sumar(vales.some((v) => v.lecturasTotal > 0) ? fueronSinComprar : noFueron, this.monto(d));
      }
    }
    const sinUsar = { creditos: noFueron.creditos + fueronSinComprar.creditos, monto: noFueron.monto + fueronSinComprar.monto };
    const resueltos = usados.creditos + sinUsar.creditos;
    return { usados, sinUsar, noFueron, fueronSinComprar, tasa: resueltos ? usados.creditos / resueltos : null };
  }
}

function tiendasActivas(
  idx: Indice,
  eventos: EventoImpacto[],
  r: Rango,
): Set<string> {
  const activas = new Set<string>();
  for (const e of eventos) if (e.concesionarioId && enRango(e.en, r)) activas.add(e.concesionarioId);
  for (const v of idx.vales) {
    if (enRango(v.consumidoEn, r) || enRango(v.ultimaLecturaEn, r)) activas.add(v.concesionarioId);
  }
  return activas;
}

function bloque(
  idx: Indice,
  eventos: EventoImpacto[],
  intentos: IntentoImpacto[],
  personas: ActividadPersona[] | null,
  r: Rango,
): BloqueImpacto {
  const desembolsados = idx.desembolsados(r);
  const desembolsado = cero();
  for (const d of desembolsados) sumar(desembolsado, idx.monto(d));

  let ventaEnCaja = 0;
  let ventaArribaDelCredito = 0;
  for (const v of idx.vales) {
    if (v.estado !== "utilizado" || !enRango(v.consumidoEn, r)) continue;
    ventaEnCaja += v.montoDispuesto ?? 0;
    if (v.montoDispuesto != null && v.montoAutorizado != null) {
      ventaArribaDelCredito += Math.max(0, v.montoDispuesto - v.montoAutorizado);
    }
  }

  const control = idx.control(desembolsados);
  const uso = idx.usoDelCredito(r);

  const eventosRango = eventos.filter((e) => enRango(e.en, r));
  const intentosRango = intentos.filter((i) => enRango(i.en, r));

  const liberados = idx.deals.filter(
    (d) => d.concesionarioId && !d.cancelado && enRango(d.creditoLiberadoFecha, r) && idx.esDePaydesk(d),
  );
  const conCotizacion = liberados.filter((d) => d.cotizacionEstatus === "completado").length;

  const activas = tiendasActivas(idx, eventos, r);
  const contarPersonas = (perfil: "tienda" | "asesor") =>
    personas === null
      ? null
      : new Set(personas.filter((p) => p.perfil === perfil && enRango(p.en, r)).map((p) => p.uid)).size;

  return {
    credito: {
      desembolsado,
      ticketPromedio: desembolsado.creditos ? desembolsado.monto / desembolsado.creditos : null,
      ventaEnCaja,
      ventaArribaDelCredito,
    },
    control: {
      base: control.base,
      completo: control.completo,
      pct: control.pct,
      sinVale: control.sinVale,
      sinComprobante: control.sinComprobante,
      subidasRechazadas: eventosRango.filter(
        (e) => e.resultado === "rechazado_auto" || e.resultado === "rechazado_admin",
      ).length,
      valesDeOtraTienda: intentosRango.filter((i) => i.motivo === "otra-tienda").length,
      codigosInexistentes: intentosRango.filter((i) => i.motivo === "no-existe").length,
    },
    uso: {
      diasADesembolso: idx.diasADesembolso(desembolsados.filter((d) => idx.esDePaydesk(d))),
      tasaUso: uso.tasa,
      usados: uso.usados,
      sinUsar: uso.sinUsar,
      noFueron: uso.noFueron,
      fueronSinComprar: uso.fueronSinComprar,
    },
    adopcion: {
      tiendasActivas: activas.size,
      tiendasHabilitadas: [...idx.tiendas.values()].filter((t) => t.habilitada).length,
      cotizacion: {
        conCotizacion,
        liberados: liberados.length,
        pct: liberados.length ? conCotizacion / liberados.length : null,
      },
      personasTienda: contarPersonas("tienda"),
      personasAsesor: contarPersonas("asesor"),
    },
  };
}

export function calcularImpacto(params: {
  deals: DealImpacto[];
  vales: ValeImpacto[];
  tiendas: TiendaImpacto[];
  eventos: EventoImpacto[];
  intentos: IntentoImpacto[];
  /** Actividad de personas desde el inicio del periodo anterior. */
  personas: ActividadPersona[];
  dias: number;
  /** Cuántos días hacia atrás se conserva la medición de uso. */
  diasRetencionUso: number;
  ahora?: Date;
  meses?: number;
}): ResultadoImpacto {
  const ahora = (params.ahora ?? new Date()).getTime();
  const { dias } = params;
  const idx = new Indice(params.deals, params.vales, params.tiendas);
  const actual: Rango = { desde: ahora - dias * DIA_MS, hasta: ahora };
  const anterior: Rango = { desde: ahora - 2 * dias * DIA_MS, hasta: actual.desde };

  const bActual = bloque(idx, params.eventos, params.intentos, params.personas, actual);
  // Si el periodo anterior ya se borró de la medición de uso, sus personas
  // saldrían en cero y la comparación diría que la adopción se disparó.
  const personasAnterior = 2 * dias <= params.diasRetencionUso ? params.personas : null;
  const bAnterior = bloque(idx, params.eventos, params.intentos, personasAnterior, anterior);

  // Antes de Paydesk, de todo el historial: es el punto de comparación
  // de los días a desembolso, y no cambia con el periodo.
  const todos: Rango = { desde: -Infinity, hasta: Infinity };
  const historicos = idx.desembolsados(todos);
  const antes = historicos.filter((d) => !idx.esDePaydesk(d));

  // Los últimos N meses calendario, incluido el actual.
  const nMeses = params.meses ?? 12;
  const meses: MesImpacto[] = [];
  const hoy = mesDe(new Date(ahora).toISOString());
  let [anio, mes] = hoy.split("-").map(Number);
  const claves: string[] = [];
  for (let i = 0; i < nMeses; i++) {
    claves.unshift(`${anio}-${String(mes).padStart(2, "0")}`);
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  const porMes = new Map<string, DealImpacto[]>(claves.map((k) => [k, []]));
  for (const d of historicos) porMes.get(mesDe(d.desembolsoFecha!))?.push(d);
  for (const k of claves) {
    const ds = porMes.get(k)!;
    const desembolsado = cero();
    for (const d of ds) sumar(desembolsado, idx.monto(d));
    meses.push({ mes: k, desembolsado, pctControl: idx.control(ds).pct });
  }

  const activas = tiendasActivas(idx, params.eventos, actual);
  const ids = new Set<string>();
  for (const d of idx.desembolsados(actual)) ids.add(d.concesionarioId!);
  for (const t of idx.tiendas.values()) if (t.habilitada) ids.add(t.concesionarioId);
  const tiendas: TiendaFila[] = [...ids].map((id) => {
    const ds = idx.desembolsados(actual, id);
    const desembolsado = cero();
    for (const d of ds) sumar(desembolsado, idx.monto(d));
    return {
      concesionarioId: id,
      nombre: idx.tiendas.get(id)?.nombre ?? id,
      desembolsado,
      pctControl: idx.control(ds).pct,
      diasADesembolso: idx.diasADesembolso(ds.filter((d) => idx.esDePaydesk(d))),
      tasaUso: idx.usoDelCredito(actual, id).tasa,
      activa: activas.has(id),
    };
  });
  tiendas.sort(
    (a, b) =>
      b.desembolsado.monto - a.desembolsado.monto ||
      b.desembolsado.creditos - a.desembolsado.creditos ||
      a.nombre.localeCompare(b.nombre, "es"),
  );

  const tiendasSinActividad = [...idx.tiendas.values()]
    .filter((t) => t.habilitada && !activas.has(t.concesionarioId))
    .map((t) => t.nombre)
    .sort((a, b) => a.localeCompare(b, "es"));

  return {
    dias,
    actual: bActual,
    anterior: bAnterior,
    antesDePaydesk: { diasADesembolso: idx.diasADesembolso(antes), creditos: antes.length },
    meses,
    tiendas,
    tiendasSinActividad,
    avisos: {
      sinArranque: ![...idx.tiendas.values()].some((t) => t.rolloutDesde),
      desembolsosSinMonto: idx.desembolsados(actual).filter((d) => idx.monto(d) === 0).length,
    },
  };
}
