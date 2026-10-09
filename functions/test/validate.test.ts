import { describe, expect, it } from "vitest";
import { nombreCoincide, normalizar, validarAnalisis } from "../src/ocr/validate";
import type { AnalisisDocumento } from "../src/ocr/analizar";

const base: AnalisisDocumento = {
  legible: true,
  tipoDetectado: "cotizacion",
  emisor: "Construrama TEQ",
  nombreCliente: "Juan Pérez López",
  montoTotal: 11600,
  montos: [10000, 1600, 11600],
  fechas: ["2025-03-12"],
  tieneFirma: null,
  senalesAlteracion: [],
  observaciones: "",
};

const fallidas = (r: ReturnType<typeof validarAnalisis>) => r.reglas.filter((x) => !x.ok).map((x) => x.id);

describe("validarAnalisis", () => {
  it("acepta una cotización que cuadra", () => {
    const r = validarAnalisis({ tipo: "cotizacion", analisis: base, cliente: "Juan Perez", montoDeclarado: 11600 });
    expect(r.estado).toBe("aprobado");
  });

  it("rechaza al momento un documento ilegible y no evalúa lo demás", () => {
    const r = validarAnalisis({
      tipo: "cotizacion",
      analisis: { ...base, legible: false },
      cliente: "Juan Perez",
      montoDeclarado: 1,
    });
    expect(r.estado).toBe("rechazado");
    expect(fallidas(r)).toEqual(["legible"]);
  });

  it("rechaza al momento un documento de otro tipo", () => {
    const r = validarAnalisis({ tipo: "comprobante", analisis: base, cliente: "Juan Perez" });
    expect(r.estado).toBe("rechazado");
    expect(fallidas(r)).toContain("tipo");
  });

  it("manda a revisión (no rechaza) un monto que no coincide", () => {
    const r = validarAnalisis({ tipo: "cotizacion", analisis: base, cliente: "Juan Perez", montoDeclarado: 9000 });
    expect(r.estado).toBe("revisar");
    expect(fallidas(r)).toEqual(["monto"]);
  });

  it("acepta el monto si aparece en cualquier renglón, con tolerancia de un centavo", () => {
    const r = validarAnalisis({
      tipo: "cotizacion",
      analisis: { ...base, montoTotal: null },
      cliente: "Juan Perez",
      montoDeclarado: 10000.004,
    });
    expect(fallidas(r)).not.toContain("monto");
  });

  it("manda a revisión un archivo repetido y uno con señales de alteración", () => {
    const r = validarAnalisis({
      tipo: "cotizacion",
      analisis: { ...base, senalesAlteracion: ["el total usa otra tipografía"] },
      cliente: "Juan Perez",
      montoDeclarado: 11600,
      duplicadoEn: "123",
    });
    expect(r.estado).toBe("revisar");
    expect(fallidas(r)).toEqual(["duplicado", "alteracion"]);
  });

  it("en un comprobante revisa firma y fecha", () => {
    const r = validarAnalisis({
      tipo: "comprobante",
      analisis: { ...base, tipoDetectado: "nota_de_remision", tieneFirma: false },
      cliente: "Juan Perez",
      fechaDeclarada: "2025-03-13",
    });
    expect(r.estado).toBe("revisar");
    expect(fallidas(r)).toEqual(["firma", "fecha"]);
  });

  it("una firma que no aplica (null) no cuenta como faltante", () => {
    const r = validarAnalisis({
      tipo: "comprobante",
      analisis: { ...base, tipoDetectado: "comprobante_de_entrega", tieneFirma: null },
      cliente: "Juan Perez",
      fechaDeclarada: "2025-03-12",
    });
    expect(r.estado).toBe("aprobado");
  });
});

describe("nombreCoincide", () => {
  it("ignora acentos, mayúsculas y orden", () => {
    expect(nombreCoincide("LOPEZ PÉREZ, Juan", "Juan Pérez")).toBe(true);
  });
  it("pide al menos la mitad de las palabras", () => {
    expect(nombreCoincide("María Gómez", "Juan Pérez López")).toBe(false);
  });
  it("no confunde una palabra contenida en otra", () => {
    expect(nombreCoincide("Analía Ruizdíaz", "Ana Ruiz")).toBe(false);
  });
});

describe("normalizar", () => {
  it("quita acentos y signos", () => {
    expect(normalizar("¡Cotización #12!")).toBe("cotizacion 12");
  });
});
