import { describe, expect, it } from "vitest";
import { calcularMetricas, mediana } from "../src/metricas/calcular";

describe("mediana", () => {
  it("par, impar y vacío", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe("calcularMetricas", () => {
  const desde = new Date("2026-01-01T00:00:00Z");
  const nombres = new Map([
    ["a", "Tienda A"],
    ["b", "Tienda B"],
  ]);

  it("cuenta por tienda, ignora cancelados y marca a la que se sale de lo normal", () => {
    const deals = [
      { concesionarioId: "a", fechaSolicitud: "2026-02-01T00:00:00Z", desembolsoFecha: "2026-02-11T00:00:00Z" },
      { concesionarioId: "a", fechaSolicitud: "2026-02-01T00:00:00Z", desembolsoFecha: null },
      { concesionarioId: "a", cancelado: true, fechaSolicitud: "2026-02-01T00:00:00Z", desembolsoFecha: null },
      { concesionarioId: "b", fechaSolicitud: "2025-06-01T00:00:00Z", desembolsoFecha: null },
    ];
    const eventos = [
      ...Array(10).fill({ concesionarioId: "a", resultado: "aceptado" }),
      ...Array(4).fill({ concesionarioId: "b", resultado: "en_revision" }),
      { concesionarioId: "b", resultado: "aceptado" },
      { concesionarioId: "b", resultado: "rechazado_admin", minutosEnRevision: 90 },
      { concesionarioId: "b", resultado: "rechazado_auto" },
      { concesionarioId: "b", resultado: "rechazado_auto" },
    ];
    const { tiendas, global } = calcularMetricas(deals, eventos, nombres, desde);
    const a = tiendas.find((t) => t.concesionarioId === "a")!;
    const b = tiendas.find((t) => t.concesionarioId === "b")!;

    expect(a.solicitudes).toBe(2);
    expect(a.desembolsadas).toBe(1);
    expect(a.diasADesembolso).toBe(10);
    expect(a.alertas).toEqual([]);

    expect(b.solicitudes).toBe(0); // su solicitud es de antes del periodo
    expect(b.documentos).toBe(7);
    expect(b.minutosAtencion).toBe(90);
    expect(b.alertas.length).toBeGreaterThan(0);
    expect(tiendas[0].concesionarioId).toBe("b"); // lo que hay que mirar, primero

    expect(global.documentos).toBe(17);
  });
});
