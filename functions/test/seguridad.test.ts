import { describe, expect, it } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";
import { assertAdmin, assertSuperAdmin, rolDeClaims } from "../src/auth/adminGuard";
import { decidir } from "../src/auth/rateLimit";
import { rutaDesdeUrlFirmada } from "../src/storage/dealFiles";
import { revisionDisponible, APROBACION_ABANDONADA_MS } from "../src/firestore/dealsRepository";

const req = (token: Record<string, unknown> | null) =>
  ({ auth: token ? { uid: "u1", token } : undefined }) as unknown as CallableRequest<unknown>;

describe("roles de administrador", () => {
  it("una cuenta sin adminRol es super (las de antes de los roles)", () => {
    expect(rolDeClaims({ admin: true })).toBe("super");
  });
  it("respeta operador", () => {
    expect(rolDeClaims({ admin: true, adminRol: "operador" })).toBe("operador");
  });
  it("un valor raro (error de dedo) cuenta como operador, nunca como super", () => {
    expect(rolDeClaims({ admin: true, adminRol: "Super" })).toBe("operador");
    expect(rolDeClaims({ admin: true, adminRol: "admin" })).toBe("operador");
    expect(rolDeClaims({ admin: true, adminRol: "super" })).toBe("super");
  });
  it("assertAdmin rechaza a quien no es admin", () => {
    expect(() => assertAdmin(req({ concesionarioIds: ["x"] }))).toThrow();
    expect(() => assertAdmin(req(null))).toThrow();
  });
  it("assertSuperAdmin deja pasar al super y rechaza al operador", () => {
    expect(assertSuperAdmin(req({ admin: true })).rol).toBe("super");
    expect(() => assertSuperAdmin(req({ admin: true, adminRol: "operador" }))).toThrow(
      /super administrador/,
    );
  });
});

describe("límite de solicitudes", () => {
  const opts = { max: 3, ventanaSeg: 60 };
  it("abre ventana nueva la primera vez", () => {
    expect(decidir(null, 1000, opts)).toEqual({ permitido: true, siguiente: { inicio: 1000, cuenta: 1 } });
  });
  it("cuenta dentro de la ventana y corta al llegar al máximo", () => {
    expect(decidir({ inicio: 0, cuenta: 2 }, 10_000, opts).permitido).toBe(true);
    expect(decidir({ inicio: 0, cuenta: 3 }, 10_000, opts).permitido).toBe(false);
  });
  it("reinicia al pasar la ventana", () => {
    expect(decidir({ inicio: 0, cuenta: 99 }, 60_000, opts)).toEqual({
      permitido: true,
      siguiente: { inicio: 60_000, cuenta: 1 },
    });
  });
});

describe("rutaDesdeUrlFirmada", () => {
  it("saca la ruta de una URL firmada vieja", () => {
    const url =
      "https://storage.googleapis.com/mi-bucket.appspot.com/paydesk_deals/123/cotizacion/1700-cot%20final.pdf?GoogleAccessId=x&Expires=16725225600&Signature=abc";
    expect(rutaDesdeUrlFirmada(url)).toBe("paydesk_deals/123/cotizacion/1700-cot final.pdf");
  });
  it("no toca URLs que no son de Storage ni rutas ajenas", () => {
    expect(rutaDesdeUrlFirmada("https://api.hubspot.com/files/123")).toBeNull();
    expect(rutaDesdeUrlFirmada("https://storage.googleapis.com/b/otra/cosa.pdf")).toBeNull();
    expect(rutaDesdeUrlFirmada("no es url")).toBeNull();
  });
});

describe("revisiones disponibles para un administrador", () => {
  const base = { storagePath: "p", fileName: "f", mimeType: null, capturado: {}, subidoEn: "2026-10-09T00:00:00Z" };
  const ahora = Date.parse("2026-10-09T12:00:00Z");
  it("pendiente sí; rechazada no", () => {
    expect(revisionDisponible({ ...base, estado: "pendiente" }, ahora)).toBe(true);
    expect(revisionDisponible({ ...base, estado: "rechazado" }, ahora)).toBe(false);
    expect(revisionDisponible(null, ahora)).toBe(false);
  });
  it("una aprobación en curso no se puede tomar; una abandonada sí", () => {
    const reciente = new Date(ahora - 60_000).toISOString();
    const vieja = new Date(ahora - APROBACION_ABANDONADA_MS - 1).toISOString();
    expect(revisionDisponible({ ...base, estado: "aprobando", resueltoEn: reciente }, ahora)).toBe(false);
    expect(revisionDisponible({ ...base, estado: "aprobando", resueltoEn: vieja }, ahora)).toBe(true);
  });
});
