import { afterEach, describe, expect, it } from "vitest";
import {
  completados,
  ETAPAS_DEFAULT,
  etapaActual,
  milestones,
  requiereAccion,
  setEtapas,
} from "../src/lib/dealScope";
import type { PayDeskDeal } from "../src/types/deal";

const deal = (cambios: Partial<PayDeskDeal> = {}): PayDeskDeal =>
  ({
    dealId: "1",
    concesionarioId: "t1",
    fechaSolicitud: "2026-05-01T00:00:00Z",
    estatusKyc: "2026-05-02T00:00:00Z",
    cotizacionEstatus: "pendiente",
    comprobanteEntregaEstatus: "pendiente",
    creditoLiberadoFecha: null,
    disposicionCreditoFecha: null,
    desembolsoFecha: null,
    ...cambios,
  }) as PayDeskDeal;

const rollout = { t1: "2026-01-01" };

afterEach(() => setEtapas(undefined));

describe("etapas configurables", () => {
  it("con las etapas por defecto cuenta las 7", () => {
    expect(milestones(deal())).toHaveLength(7);
    expect(completados(deal())).toBe(2);
  });

  it("una etapa personalizada se marca con su fecha", () => {
    setEtapas([
      ...ETAPAS_DEFAULT.slice(0, 2),
      { id: "custom_x", label: "Visita", tipo: "personalizada", propiedad: "hs_x" },
    ]);
    expect(milestones(deal())).toEqual([true, true, false]);
    expect(milestones(deal({ etapasExtra: { custom_x: "2026-05-03T00:00:00Z" } }))).toEqual([true, true, true]);
  });

  it("un deal desembolsado está completo aunque falten fechas intermedias", () => {
    expect(completados(deal({ estatusKyc: null, desembolsoFecha: "2026-06-01T00:00:00Z" }))).toBe(7);
  });
});

describe("requiereAccion", () => {
  it("un documento pendiente le toca a la tienda", () => {
    expect(requiereAccion(deal(), rollout)).toBe(true);
  });

  it("un documento en revisión ya no le toca a la tienda", () => {
    const d = deal({
      comprobanteEntregaEstatus: "completado",
      cotizacionRevision: { estado: "pendiente", fileName: "c.pdf", capturado: {}, subidoEn: "2026-05-03" },
    });
    expect(requiereAccion(d, rollout)).toBe(false);
  });

  it("un documento que Aviva está aprobando tampoco", () => {
    const d = deal({
      comprobanteEntregaEstatus: "completado",
      cotizacionRevision: { estado: "aprobando", fileName: "c.pdf", capturado: {}, subidoEn: "2026-05-03" },
    });
    expect(requiereAccion(d, rollout)).toBe(false);
  });

  it("un documento rechazado por Aviva vuelve a ser de la tienda", () => {
    const d = deal({
      comprobanteEntregaEstatus: "completado",
      cotizacionRevision: { estado: "rechazado", fileName: "c.pdf", capturado: {}, subidoEn: "2026-05-03" },
    });
    expect(requiereAccion(d, rollout)).toBe(true);
  });

  it("antes del arranque de la tienda no se le pide nada", () => {
    expect(requiereAccion(deal({ fechaSolicitud: "2025-12-01T00:00:00Z" }), rollout)).toBe(false);
  });
});

describe("etapa actual (vista del vendedor externo)", () => {
  it("dice la última etapa alcanzada y la que sigue", () => {
    const e = etapaActual(deal());
    expect(e.actual?.id).toBe("kyc");
    expect(e.siguiente?.id).toBe("cotizacion");
    expect(e.completa).toBe(false);
  });

  it("si falta una fecha intermedia, manda la etapa más avanzada", () => {
    const e = etapaActual(
      deal({ estatusKyc: null, cotizacionEstatus: "completado", creditoLiberadoFecha: "2026-05-05T00:00:00Z" }),
    );
    expect(e.actual?.id).toBe("credito");
    expect(e.siguiente?.id).toBe("disposicion");
  });

  it("desembolsado: terminado y sin siguiente", () => {
    const e = etapaActual(deal({ desembolsoFecha: "2026-06-01T00:00:00Z" }));
    expect(e).toMatchObject({ completa: true, siguiente: null });
    expect(e.actual?.id).toBe("desembolso");
  });

  it("funciona con lo poco que recibe el vendedor", () => {
    const soloEtapas = {
      fechaSolicitud: "2026-05-01T00:00:00Z",
      estatusKyc: null,
      cotizacionEstatus: "pendiente" as const,
      creditoLiberadoFecha: null,
      disposicionCreditoFecha: null,
      comprobanteEntregaEstatus: "pendiente" as const,
      desembolsoFecha: null,
    };
    expect(etapaActual(soloEtapas).actual?.id).toBe("solicitud");
  });
});
