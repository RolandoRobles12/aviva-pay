import { describe, expect, it } from "vitest";
import { calcularReporteVales } from "../src/vale/reporte";
import type { PayDeskVale } from "../src/types/vale";

const AHORA = Date.parse("2026-11-26T12:00:00Z");
const MANANA = "2026-11-27T12:00:00Z";

function vale(codigo: string, extra: Partial<PayDeskVale>): PayDeskVale {
  return {
    codigo,
    token: `tok-${codigo}`,
    dealId: "d1",
    concesionarioId: "t1",
    cliente: null,
    montoAutorizado: 1000,
    estado: "emitido",
    emitidoEn: null as never,
    venceEn: MANANA,
    lecturasTotal: 0,
    ultimaLecturaEn: null,
    ultimoAccesoEn: null,
    ultimoAccesoUid: null,
    consumidoEn: null,
    consumidoPor: null,
    montoDispuesto: null,
    emitidoPor: "webhook",
    reemplazaA: null,
    ...extra,
  };
}

const tiendas = new Map([["t1", "Tienda 1"]]);

describe("calcularReporteVales: crédito nunca gastado", () => {
  it("el vale viejo de una reemisión no cuenta como perdido", () => {
    const vales = [
      vale("V1", { dealId: "d1", estado: "cancelado", montoAutorizado: 5000 }),
      vale("V2", { dealId: "d1", reemplazaA: "V1", montoAutorizado: 5000 }),
    ];
    const r = calcularReporteVales(vales, tiendas, AHORA);
    expect(r.totales).toEqual({ vigente: 1, utilizado: 0, vencido: 0, cancelado: 1 });
    expect(r.montos.nuncaGastado).toBe(0);
    expect(r.sinUsar).toEqual({ nuncaLeidos: 0, leidosSinUsar: 0 });
  });

  it("un crédito cancelado sí cuenta, aunque su vale haya nacido de una reemisión", () => {
    const vales = [
      // Crédito cancelado sin reemisión.
      vale("V3", { dealId: "d2", estado: "cancelado", montoAutorizado: 2000 }),
      // Reemitido y luego cancelado junto con su crédito: V4 lo reemplazó V5,
      // pero V5 murió sin reemplazo. El cliente sí llegó a leer V5.
      vale("V4", { dealId: "d3", estado: "cancelado", montoAutorizado: 3000 }),
      vale("V5", { dealId: "d3", estado: "cancelado", reemplazaA: "V4", montoAutorizado: 3000, lecturasTotal: 2 }),
    ];
    const r = calcularReporteVales(vales, tiendas, AHORA);
    expect(r.montos.nuncaGastado).toBe(5000);
    expect(r.sinUsar).toEqual({ nuncaLeidos: 1, leidosSinUsar: 1 });
    expect(r.porTienda[0].montoNuncaGastado).toBe(5000);
  });
});
