import { describe, expect, it } from "vitest";
import { inicioDelDia, resolverPeriodo } from "../src/metricas/periodos";

// México no tiene horario de verano: medianoche allá = 06:00 UTC.
const iso = (ms: number) => new Date(ms).toISOString();
// Jueves 27 de noviembre de 2026, 10:00 en México.
const AHORA = new Date("2026-11-27T16:00:00Z");

describe("resolverPeriodo", () => {
  it("medianoche en la Ciudad de México", () => {
    expect(iso(inicioDelDia(2026, 11, 27))).toBe("2026-11-27T06:00:00.000Z");
    expect(iso(inicioDelDia(2026, 13, 1))).toBe("2027-01-01T06:00:00.000Z");
  });

  it("esta semana: lunes a ahora, contra el mismo tramo de la semana pasada", () => {
    const { actual, anterior } = resolverPeriodo("semana", AHORA);
    expect(iso(actual.desde)).toBe("2026-11-23T06:00:00.000Z");
    expect(iso(actual.hasta)).toBe("2026-11-27T16:00:00.000Z");
    expect(iso(anterior.desde)).toBe("2026-11-16T06:00:00.000Z");
    expect(iso(anterior.hasta)).toBe("2026-11-20T16:00:00.000Z");
  });

  it("semana pasada: lunes a domingo completos, contra la semana anterior", () => {
    const { actual, anterior } = resolverPeriodo("semana-pasada", AHORA);
    expect(iso(actual.desde)).toBe("2026-11-16T06:00:00.000Z");
    expect(iso(actual.hasta)).toBe("2026-11-23T06:00:00.000Z");
    expect(iso(anterior.desde)).toBe("2026-11-09T06:00:00.000Z");
    expect(iso(anterior.hasta)).toBe("2026-11-16T06:00:00.000Z");
  });

  it("un domingo en la noche sigue siendo de esa semana", () => {
    // Domingo 29 de noviembre, 23:00 en México = lunes 30, 05:00 UTC.
    const { actual } = resolverPeriodo("semana", new Date("2026-11-30T05:00:00Z"));
    expect(iso(actual.desde)).toBe("2026-11-23T06:00:00.000Z");
  });

  it("esta quincena: del 16 a ahora, contra el mismo tramo de la quincena anterior", () => {
    const { actual, anterior } = resolverPeriodo("quincena", AHORA);
    expect(iso(actual.desde)).toBe("2026-11-16T06:00:00.000Z");
    expect(iso(anterior.desde)).toBe("2026-11-01T06:00:00.000Z");
    expect(iso(anterior.hasta)).toBe("2026-11-12T16:00:00.000Z");
  });

  it("el tramo anterior no pasa del fin de su quincena (31 contra una de 15 días)", () => {
    // 31 de diciembre, 10:00 en México: la quincena anterior (1–15) dura 15 días.
    const { anterior } = resolverPeriodo("quincena", new Date("2026-12-31T16:00:00Z"));
    expect(iso(anterior.desde)).toBe("2026-12-01T06:00:00.000Z");
    expect(iso(anterior.hasta)).toBe("2026-12-16T06:00:00.000Z");
  });

  it("quincena pasada: 1 al 15 completa, contra la segunda de octubre", () => {
    const { actual, anterior } = resolverPeriodo("quincena-pasada", AHORA);
    expect(iso(actual.desde)).toBe("2026-11-01T06:00:00.000Z");
    expect(iso(actual.hasta)).toBe("2026-11-16T06:00:00.000Z");
    expect(iso(anterior.desde)).toBe("2026-10-16T06:00:00.000Z");
    expect(iso(anterior.hasta)).toBe("2026-11-01T06:00:00.000Z");
  });

  it("quincena pasada cruzando el año", () => {
    const { actual } = resolverPeriodo("quincena-pasada", new Date("2027-01-05T16:00:00Z"));
    expect(iso(actual.desde)).toBe("2026-12-16T06:00:00.000Z");
    expect(iso(actual.hasta)).toBe("2027-01-01T06:00:00.000Z");
  });

  it("ventanas de días terminan ahora", () => {
    const { actual, anterior } = resolverPeriodo("30", AHORA);
    expect(actual.hasta - actual.desde).toBe(30 * 86_400_000);
    expect(anterior.hasta).toBe(actual.desde);
  });
});
