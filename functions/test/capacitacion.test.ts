import { describe, expect, it } from "vitest";
import {
  LECCIONES_CAPACITACION,
  LECCIONES_VENDEDOR,
  esLeccion,
  resumirCapacitacion,
} from "../src/capacitacion/lecciones";

describe("capacitación de tiendas", () => {
  it("solo acepta lecciones que existen", () => {
    expect(esLeccion("validar-codigo")).toBe(true);
    expect(esLeccion("inventada")).toBe(false);
    expect(esLeccion(undefined)).toBe(false);
    expect(esLeccion(3)).toBe(false);
  });

  it("resume en el orden del curso y sin ids retirados", () => {
    expect(resumirCapacitacion(["cotizacion", "retirada", "bienvenida"])).toEqual({
      completadas: ["bienvenida", "cotizacion"],
      total: LECCIONES_CAPACITACION.length,
      completa: false,
    });
  });

  it("un documento sin lecciones (o corrupto) cuenta como nada hecho", () => {
    expect(resumirCapacitacion(undefined).completadas).toEqual([]);
    expect(resumirCapacitacion("bienvenida").completadas).toEqual([]);
  });

  it("completa con todas", () => {
    expect(resumirCapacitacion([...LECCIONES_CAPACITACION]).completa).toBe(true);
  });
});

describe("curso del vendedor", () => {
  it("sus lecciones no valen para el curso de la tienda, ni al revés", () => {
    expect(esLeccion("vendedor-etapas", "vendedor")).toBe(true);
    expect(esLeccion("vendedor-etapas", "tienda")).toBe(false);
    expect(esLeccion("cotizacion", "vendedor")).toBe(false);
  });

  it("resume contra su propio curso", () => {
    const guardadas = ["bienvenida", "vendedor-inicio", "vendedor-etapas"];
    expect(resumirCapacitacion(guardadas, "vendedor")).toEqual({
      completadas: ["vendedor-inicio", "vendedor-etapas"],
      total: LECCIONES_VENDEDOR.length,
      completa: false,
    });
    expect(resumirCapacitacion(guardadas, "tienda").completadas).toEqual(["bienvenida"]);
  });
});
