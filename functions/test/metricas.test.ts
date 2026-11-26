import { describe, expect, it } from "vitest";
import { calcularDocumentosPorTienda, mediana } from "../src/metricas/calcular";

describe("mediana", () => {
  it("par, impar y vacío", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
});

describe("calcularDocumentosPorTienda", () => {
  const nombres = new Map([
    ["a", "Tienda A"],
    ["b", "Tienda B"],
  ]);

  it("cuenta por tienda y marca primero a la que se sale de lo normal", () => {
    const eventos = [
      ...Array(10).fill({ concesionarioId: "a", resultado: "aceptado" }),
      ...Array(4).fill({ concesionarioId: "b", resultado: "en_revision" }),
      { concesionarioId: "b", resultado: "aceptado" },
      { concesionarioId: "b", resultado: "rechazado_admin", minutosEnRevision: 90 },
      { concesionarioId: "b", resultado: "rechazado_auto" },
      { concesionarioId: "b", resultado: "rechazado_auto" },
    ];
    const { tiendas, global } = calcularDocumentosPorTienda(eventos, nombres);
    const a = tiendas.find((t) => t.concesionarioId === "a")!;
    const b = tiendas.find((t) => t.concesionarioId === "b")!;

    expect(a.documentos).toBe(10);
    expect(a.alertas).toEqual([]);

    expect(b.documentos).toBe(7);
    expect(b.minutosAtencion).toBe(90);
    expect(b.alertas.length).toBeGreaterThan(0);
    expect(tiendas[0].concesionarioId).toBe("b"); // lo que hay que mirar, primero

    expect(global.documentos).toBe(17);
  });
});
