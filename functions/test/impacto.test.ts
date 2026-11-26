import { describe, expect, it } from "vitest";
import {
  calcularImpacto,
  type DealImpacto,
  type TiendaImpacto,
  type ValeImpacto,
} from "../src/metricas/impacto";

const AHORA = new Date("2026-06-30T12:00:00Z");
// 30 días: actual = 31 may → 30 jun; anterior = 1 may → 31 may.
const EN_ACTUAL = "2026-06-15T12:00:00Z";
const EN_ANTERIOR = "2026-05-15T12:00:00Z";

function deal(p: Partial<DealImpacto> & { dealId: string }): DealImpacto {
  return {
    concesionarioId: "a",
    cancelado: false,
    fechaSolicitud: "2026-06-01T00:00:00Z",
    montoAprobado: 10_000,
    creditoLiberadoFecha: null,
    cotizacionEstatus: "pendiente",
    comprobanteEntregaEstatus: "pendiente",
    desembolsoFecha: null,
    canceladoFecha: null,
    ...p,
  };
}

function vale(p: Partial<ValeImpacto> & { codigo: string; dealId: string }): ValeImpacto {
  return {
    concesionarioId: "a",
    estado: "emitido",
    montoAutorizado: 10_000,
    montoDispuesto: null,
    emitidoEn: "2026-06-01T00:00:00Z",
    consumidoEn: null,
    ultimaLecturaEn: null,
    venceEn: "2026-12-31T00:00:00Z",
    lecturasTotal: 0,
    reemplazaA: null,
    ...p,
  };
}

const TIENDAS: TiendaImpacto[] = [
  { concesionarioId: "a", nombre: "Tienda A", rolloutDesde: "2026-05-01", habilitada: true },
  { concesionarioId: "b", nombre: "Tienda B", rolloutDesde: "2026-05-01", habilitada: true },
  { concesionarioId: "c", nombre: "Tienda C", rolloutDesde: null, habilitada: false },
];

function calcular(deals: DealImpacto[], vales: ValeImpacto[] = [], extra: Partial<Parameters<typeof calcularImpacto>[0]> = {}) {
  return calcularImpacto({
    deals,
    vales,
    tiendas: TIENDAS,
    eventos: [],
    intentos: [],
    personas: [],
    dias: 30,
    diasRetencionUso: 365,
    ahora: AHORA,
    ...extra,
  });
}

describe("calcularImpacto · crédito y control", () => {
  it("control completo = vale usado + comprobante, medido en pesos y solo sobre créditos de Paydesk", () => {
    const deals = [
      // Completo: vale usado y comprobante.
      deal({ dealId: "1", montoAprobado: 30_000, desembolsoFecha: EN_ACTUAL, comprobanteEntregaEstatus: "completado" }),
      // Comprobante sin vale.
      deal({ dealId: "2", montoAprobado: 10_000, desembolsoFecha: EN_ACTUAL, comprobanteEntregaEstatus: "completado" }),
      // Vale sin comprobante.
      deal({ dealId: "3", montoAprobado: 10_000, desembolsoFecha: EN_ACTUAL }),
      // Histórico (aprobado antes del arranque): cuenta en el monto, no en control.
      deal({ dealId: "4", montoAprobado: 50_000, fechaSolicitud: "2026-04-01T00:00:00Z", desembolsoFecha: EN_ACTUAL }),
      // Cancelado: no cuenta.
      deal({ dealId: "5", cancelado: true, desembolsoFecha: EN_ACTUAL }),
      // Periodo anterior.
      deal({ dealId: "6", montoAprobado: 20_000, desembolsoFecha: EN_ANTERIOR, comprobanteEntregaEstatus: "completado" }),
    ];
    const vales = [
      vale({ codigo: "v1", dealId: "1", estado: "utilizado", consumidoEn: EN_ACTUAL, montoDispuesto: 32_000, montoAutorizado: 30_000 }),
      vale({ codigo: "v3", dealId: "3", estado: "utilizado", consumidoEn: EN_ACTUAL, montoDispuesto: 10_000 }),
    ];
    const r = calcular(deals, vales);

    expect(r.actual.credito.desembolsado).toEqual({ creditos: 4, monto: 100_000 });
    expect(r.actual.credito.ticketPromedio).toBe(25_000);
    expect(r.actual.credito.ventaEnCaja).toBe(42_000);
    expect(r.actual.credito.ventaArribaDelCredito).toBe(2_000);

    expect(r.actual.control.base).toEqual({ creditos: 3, monto: 50_000 });
    expect(r.actual.control.completo).toEqual({ creditos: 1, monto: 30_000 });
    expect(r.actual.control.pct).toBeCloseTo(0.6);
    expect(r.actual.control.sinVale).toEqual({ creditos: 1, monto: 10_000 });
    expect(r.actual.control.sinComprobante).toEqual({ creditos: 1, monto: 10_000 });

    expect(r.anterior.credito.desembolsado).toEqual({ creditos: 1, monto: 20_000 });
    expect(r.anterior.control.pct).toBe(0);
  });

  it("sin fecha de arranque no hay base de control y lo avisa", () => {
    const r = calcularImpacto({
      deals: [deal({ dealId: "1", desembolsoFecha: EN_ACTUAL })],
      vales: [],
      tiendas: [{ concesionarioId: "a", nombre: "A", rolloutDesde: null, habilitada: true }],
      eventos: [],
      intentos: [],
      personas: [],
      dias: 30,
      diasRetencionUso: 365,
      ahora: AHORA,
    });
    expect(r.actual.control.pct).toBeNull();
    expect(r.avisos.sinArranque).toBe(true);
  });

  it("usa el monto del vale cuando el deal no trae monto, y avisa si no hay ninguno", () => {
    const deals = [
      deal({ dealId: "1", montoAprobado: null, desembolsoFecha: EN_ACTUAL }),
      deal({ dealId: "2", montoAprobado: null, desembolsoFecha: EN_ACTUAL }),
    ];
    const r = calcular(deals, [vale({ codigo: "v1", dealId: "1", montoAutorizado: 7_000 })]);
    expect(r.actual.credito.desembolsado.monto).toBe(7_000);
    expect(r.avisos.desembolsosSinMonto).toBe(1);
  });

  it("cuenta lo que Paydesk detuvo en el periodo", () => {
    const r = calcular([], [], {
      eventos: [
        { concesionarioId: "a", resultado: "rechazado_auto", en: EN_ACTUAL },
        { concesionarioId: "a", resultado: "rechazado_admin", en: EN_ACTUAL },
        { concesionarioId: "a", resultado: "aceptado", en: EN_ACTUAL },
        { concesionarioId: "a", resultado: "rechazado_auto", en: EN_ANTERIOR },
      ],
      intentos: [
        { concesionarioId: "b", motivo: "otra-tienda", en: EN_ACTUAL },
        { concesionarioId: "b", motivo: "no-existe", en: EN_ACTUAL },
        { concesionarioId: "b", motivo: "no-existe", en: EN_ACTUAL },
      ],
    });
    expect(r.actual.control.subidasRechazadas).toBe(2);
    expect(r.anterior.control.subidasRechazadas).toBe(1);
    expect(r.actual.control.valesDeOtraTienda).toBe(1);
    expect(r.actual.control.codigosInexistentes).toBe(2);
  });
});

describe("calcularImpacto · uso del crédito y velocidad", () => {
  it("usado = desembolsado o vale validado; sin usar = cancelado sin nada de eso; solo créditos de Paydesk", () => {
    const deals = [
      // Usado: desembolsado sin que escanearan el vale (el vale venció).
      deal({ dealId: "1", desembolsoFecha: EN_ACTUAL }),
      // Usado: validó su vale, aún sin desembolso.
      deal({ dealId: "2" }),
      // Cancelado sin que nadie escaneara el vale.
      deal({ dealId: "3", montoAprobado: 5_000, cancelado: true, canceladoFecha: EN_ACTUAL }),
      // Cancelado después de que escanearon el vale y no compró.
      deal({ dealId: "4", montoAprobado: 8_000, cancelado: true, canceladoFecha: EN_ACTUAL }),
      // Vale vencido pero crédito vivo: todavía no se resuelve, no cuenta.
      deal({ dealId: "5" }),
      // Anterior al arranque, cancelado: no cuenta.
      deal({ dealId: "6", fechaSolicitud: "2026-04-01T00:00:00Z", cancelado: true, canceladoFecha: EN_ACTUAL }),
      // Usado en el periodo anterior.
      deal({ dealId: "7", desembolsoFecha: EN_ANTERIOR }),
    ];
    const vales = [
      vale({ codigo: "v1", dealId: "1", venceEn: "2026-06-04T00:00:00Z" }),
      vale({ codigo: "v2", dealId: "2", estado: "utilizado", consumidoEn: EN_ACTUAL }),
      vale({ codigo: "v3", dealId: "3", estado: "cancelado" }),
      vale({ codigo: "v4", dealId: "4", estado: "cancelado", lecturasTotal: 2 }),
      vale({ codigo: "v5", dealId: "5", venceEn: "2026-06-04T00:00:00Z" }),
    ];
    const r = calcular(deals, vales);
    expect(r.actual.uso.usados).toEqual({ creditos: 2, monto: 20_000 });
    expect(r.actual.uso.sinUsar).toEqual({ creditos: 2, monto: 13_000 });
    expect(r.actual.uso.noFueron).toEqual({ creditos: 1, monto: 5_000 });
    expect(r.actual.uso.fueronSinComprar).toEqual({ creditos: 1, monto: 8_000 });
    expect(r.actual.uso.tasaUso).toBe(0.5);
    expect(r.anterior.uso.usados.creditos).toBe(1);
  });

  it("un crédito usado en un periodo no se vuelve a contar cuando se desembolsa en el siguiente", () => {
    const deals = [deal({ dealId: "1", desembolsoFecha: EN_ACTUAL })];
    const vales = [vale({ codigo: "v1", dealId: "1", estado: "utilizado", consumidoEn: EN_ANTERIOR })];
    const r = calcular(deals, vales);
    expect(r.actual.uso.usados.creditos).toBe(0);
    expect(r.anterior.uso.usados.creditos).toBe(1);
  });

  it("días a desembolso solo de créditos de Paydesk; antes de Paydesk, de todo el historial", () => {
    const deals = [
      deal({ dealId: "1", fechaSolicitud: "2026-06-01T12:00:00Z", desembolsoFecha: "2026-06-05T12:00:00Z" }),
      deal({ dealId: "2", fechaSolicitud: "2026-06-01T12:00:00Z", desembolsoFecha: "2026-06-07T12:00:00Z" }),
      // Anterior al arranque, desembolsado en el periodo: no entra en los días del periodo.
      deal({ dealId: "3", fechaSolicitud: "2026-04-01T12:00:00Z", desembolsoFecha: "2026-06-10T12:00:00Z" }),
      deal({ dealId: "4", fechaSolicitud: "2026-01-01T12:00:00Z", desembolsoFecha: "2026-01-21T12:00:00Z" }),
    ];
    const r = calcular(deals);
    expect(r.actual.uso.diasADesembolso).toBe(5);
    expect(r.antesDePaydesk).toEqual({ diasADesembolso: 45, creditos: 2 });
  });
});

describe("calcularImpacto · adopción", () => {
  it("tiendas activas, cotización en Paydesk y personas", () => {
    const deals = [
      deal({ dealId: "1", creditoLiberadoFecha: EN_ACTUAL, cotizacionEstatus: "completado" }),
      deal({ dealId: "2", creditoLiberadoFecha: EN_ACTUAL }),
      // Histórico: no entra en la cuenta de cotización.
      deal({ dealId: "3", fechaSolicitud: "2026-04-01T00:00:00Z", creditoLiberadoFecha: EN_ACTUAL }),
    ];
    const r = calcular(deals, [], {
      eventos: [{ concesionarioId: "a", resultado: "aceptado", en: EN_ACTUAL }],
      personas: [
        { uid: "u1", perfil: "tienda", en: EN_ACTUAL },
        { uid: "u1", perfil: "tienda", en: EN_ACTUAL },
        { uid: "u2", perfil: "asesor", en: EN_ACTUAL },
        { uid: "u3", perfil: "tienda", en: EN_ANTERIOR },
      ],
    });
    expect(r.actual.adopcion.tiendasActivas).toBe(1);
    expect(r.actual.adopcion.tiendasHabilitadas).toBe(2);
    expect(r.tiendasSinActividad).toEqual(["Tienda B"]);
    expect(r.actual.adopcion.cotizacion).toEqual({ conCotizacion: 1, liberados: 2, pct: 0.5 });
    expect(r.actual.adopcion.personasTienda).toBe(1);
    expect(r.actual.adopcion.personasAsesor).toBe(1);
    expect(r.anterior.adopcion.personasTienda).toBe(1);
  });

  it("no compara personas contra un periodo que la medición ya borró", () => {
    const r = calcular([], [], { dias: 365, diasRetencionUso: 365 });
    expect(r.actual.adopcion.personasTienda).toBe(0);
    expect(r.anterior.adopcion.personasTienda).toBeNull();
  });
});

describe("calcularImpacto · meses y tiendas", () => {
  it("serie de 12 meses en hora de México y tabla por tienda ordenada por monto", () => {
    const deals = [
      // 1 jun 03:00 UTC = 31 may en México.
      deal({ dealId: "1", montoAprobado: 5_000, desembolsoFecha: "2026-06-01T03:00:00Z" }),
      deal({ dealId: "2", concesionarioId: "b", montoAprobado: 40_000, desembolsoFecha: EN_ACTUAL, comprobanteEntregaEstatus: "completado" }),
      deal({ dealId: "3", montoAprobado: 10_000, desembolsoFecha: EN_ACTUAL }),
    ];
    const vales = [vale({ codigo: "v2", dealId: "2", concesionarioId: "b", estado: "utilizado", consumidoEn: EN_ACTUAL })];
    const r = calcular(deals, vales);

    expect(r.meses).toHaveLength(12);
    expect(r.meses[11].mes).toBe("2026-06");
    expect(r.meses[0].mes).toBe("2025-07");
    expect(r.meses[10]).toEqual({ mes: "2026-05", desembolsado: { creditos: 1, monto: 5_000 }, pctControl: 0 });
    expect(r.meses[11].desembolsado).toEqual({ creditos: 2, monto: 50_000 });
    expect(r.meses[11].pctControl).toBeCloseTo(0.8);

    expect(r.tiendas.map((t) => t.nombre)).toEqual(["Tienda B", "Tienda A"]);
    expect(r.tiendas[0]).toMatchObject({ pctControl: 1, tasaUso: 1, activa: true });
    expect(r.tiendas[1]).toMatchObject({ desembolsado: { creditos: 2, monto: 15_000 }, pctControl: 0, activa: false });
  });
});
