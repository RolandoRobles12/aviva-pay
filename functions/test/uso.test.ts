import { describe, expect, it } from "vitest";
import {
  corregirReloj,
  eventosValidos,
  LoteSchema,
  limpiarTexto,
  perfilDeClaims,
  type Evento,
} from "../src/uso/eventos";
import { cubeta, debeGrabar } from "../src/uso/grabacion";
import { calcularUso, diaLocal, horaLocal, momentosDeSesion, puntosDePantalla, type LoteUso } from "../src/uso/calcular";

const T0 = Date.UTC(2026, 10, 20, 18, 0, 0); // 12:00 en la Ciudad de México

function lote(eventos: Evento[], extra: Partial<LoteUso> = {}): LoteUso {
  return {
    uid: "u1",
    email: "caja@tienda.mx",
    perfil: "tienda",
    tiendas: ["t1"],
    sesionId: "sesion-aaaa",
    dispositivo: "escritorio",
    eventos,
    ...extra,
  };
}

const paso = (f: "cotizacion" | "comprobante" | "vale" | "camara", s: string, en: number, d?: string): Evento => ({
  t: "paso",
  f,
  s,
  p: "Mis clientes",
  en,
  ...(d ? { d } : {}),
});

describe("eventos que llegan del portal", () => {
  it("quita correos y números largos de etiquetas y mensajes", () => {
    expect(limpiarTexto("Error de juan.perez@correo.com con folio 123456")).toBe("Error de [correo] con folio #");
    expect(limpiarTexto("x".repeat(200), 10)).toHaveLength(10);
  });

  it("descarta eventos raros sin tirar el lote", () => {
    const r = eventosValidos([
      { t: "toque", p: "Mis clientes", x: 10, y: 20, w: 1280, e: "Subir cotización", en: T0 },
      { t: "inventado", en: T0 },
      { t: "paso", f: "vale", s: "no-es-un-paso", p: "Validar código", en: T0 },
      { t: "paso", f: "vale", s: "captura", d: "pistola", p: "Validar código", en: T0 },
      { t: "pantalla", p: "Mis clientes", ms: 99 * 60_000, en: T0 },
    ]);
    expect(r.map((e) => e.t)).toEqual(["toque", "paso"]);
  });

  it("acepta lotes con versión e id, y rechaza ids raros", () => {
    const base = { sesionId: "sesion-aaaa", dispositivo: "tablet", ahora: T0, eventos: [] };
    expect(LoteSchema.safeParse({ ...base, v: 1, loteId: "abc123def456" }).success).toBe(true);
    expect(LoteSchema.safeParse(base).success).toBe(true);
    expect(LoteSchema.safeParse({ ...base, loteId: "../otro/doc" }).success).toBe(false);
  });

  it("limpia el texto también en el servidor", () => {
    const [e] = eventosValidos([{ t: "error", p: "Mis clientes", m: "Falló el deal 98765432", en: T0 }]);
    expect(e).toMatchObject({ m: "Falló el deal #" });
  });

  it("corrige el reloj del navegador", () => {
    const [e] = corregirReloj([{ t: "senal", ms: 5000, en: 1000 }], 2000, 7000);
    expect(e.en).toBe(6000);
  });

  it("el perfil sale de los claims", () => {
    expect(perfilDeClaims({ concesionarioIds: ["a"] })).toEqual({ perfil: "tienda", tiendas: ["a"] });
    expect(perfilDeClaims({ vendedorIds: ["b"] })).toEqual({ perfil: "asesor", tiendas: ["b"] });
    expect(perfilDeClaims({ admin: true })).toBeNull();
  });
});

describe("qué sesiones se graban", () => {
  const base = { porcentajeGrabacion: 10, grabarHasta: {} as Record<string, number> };

  it("la decisión es estable para la misma sesión", () => {
    expect(cubeta("sesion-1234")).toBe(cubeta("sesion-1234"));
  });

  it("con 0 % no se graba nada al azar y con 100 % todo", () => {
    expect(debeGrabar({ ...base, porcentajeGrabacion: 0 }, "s-12345678", "a@b.mx", T0)).toBe(false);
    expect(debeGrabar({ ...base, porcentajeGrabacion: 100 }, "s-12345678", "a@b.mx", T0)).toBe(true);
  });

  it("aproxima el porcentaje", () => {
    let grabadas = 0;
    for (let i = 0; i < 4000; i++) if (debeGrabar(base, `sesion-${i}`, null, T0)) grabadas++;
    expect(grabadas / 4000).toBeGreaterThan(0.07);
    expect(grabadas / 4000).toBeLessThan(0.13);
  });

  it("graba todo de la persona elegida mientras no venza", () => {
    const c = { porcentajeGrabacion: 0, grabarHasta: { "caja@tienda.mx": T0 + 1000 } };
    expect(debeGrabar(c, "s-12345678", "Caja@Tienda.mx", T0)).toBe(true);
    expect(debeGrabar(c, "s-12345678", "caja@tienda.mx", T0 + 2000)).toBe(false);
  });
});

describe("resumen de uso", () => {
  it("hora y día en la Ciudad de México", () => {
    expect(horaLocal(T0)).toBe(12);
    expect(diaLocal(Date.UTC(2026, 10, 21, 3, 0))).toBe("2026-11-20");
  });

  it("suma tiempo, toques, frustración, errores y señal", () => {
    const r = calcularUso([
      lote([
        { t: "pantalla", p: "Mis clientes", ms: 120_000, en: T0 },
        { t: "pantalla", p: "Validar código", ms: 60_000, en: T0 + 120_000 },
        { t: "toque", p: "Mis clientes", x: 1, y: 1, w: 1000, e: "Subir cotización", en: T0 },
        { t: "toque", p: "Mis clientes", x: 1, y: 1, w: 1000, e: "Sin botón · Tabla de clientes", sb: true, en: T0 },
        { t: "frustracion", p: "Mis clientes", x: 1, y: 1, w: 1000, e: "Sin botón · Tabla de clientes", n: 4, en: T0 },
        { t: "error", p: "Mis clientes", m: "Algo falló", en: T0 },
        { t: "senal", ms: 30_000, en: T0 },
      ]),
      lote([{ t: "pantalla", p: "Asesor · Clientes", ms: 60_000, en: T0 }], {
        uid: "u2",
        email: "asesor@tienda.mx",
        perfil: "asesor",
        sesionId: "sesion-bbbb",
      }),
    ]);
    expect(r.totales).toMatchObject({
      personas: 2,
      sesiones: 2,
      minutos: 4,
      toques: 2,
      sinBoton: 1,
      frustracion: 1,
      errores: 1,
      cortesSenal: 1,
      minutosSinSenal: 0.5,
    });
    expect(r.pantallas[0]).toMatchObject({ pantalla: "Mis clientes", minutos: 2, toques: 2, frustracion: 1 });
    expect(r.porHora[12]).toBe(4);
    expect(r.porDia).toEqual([{ dia: "2026-11-20", minutos: 4, sesiones: 2 }]);
    expect(r.sinBoton[0]).toEqual({ pantalla: "Mis clientes", elemento: "Sin botón · Tabla de clientes", veces: 1 });
    expect(r.errores[0]).toMatchObject({ mensaje: "Algo falló", veces: 1, personas: 1 });
  });

  it("cuenta los eventos que no se reconocieron, aunque el lote venga vacío", () => {
    const r = calcularUso([lote([], { descartados: 3 }), lote([{ t: "senal", ms: 1000, en: T0 }], { descartados: 1 })]);
    expect(r.totales.descartados).toBe(4);
    expect(r.totales.sesiones).toBe(1);
  });

  it("arma el embudo de documentos por intento, con el motivo de los que no se guardaron", () => {
    const r = calcularUso([
      lote([
        // 1: se guardó al segundo envío (el primero lo rechazó la verificación)
        paso("cotizacion", "abrir", T0),
        paso("cotizacion", "archivo", T0 + 1),
        paso("cotizacion", "enviar", T0 + 2),
        paso("cotizacion", "rechazado", T0 + 3),
        paso("cotizacion", "enviar", T0 + 4),
        paso("cotizacion", "revision", T0 + 5),
        // 2: cerró sin enviar
        paso("cotizacion", "abrir", T0 + 10),
        paso("cotizacion", "cancelar", T0 + 11),
        // 3: sin señal al enviar
        paso("cotizacion", "abrir", T0 + 20),
        paso("cotizacion", "archivo", T0 + 21),
        paso("cotizacion", "enviar", T0 + 22),
        paso("cotizacion", "error", T0 + 23, "sin-senal"),
        // comprobante rechazado
        paso("comprobante", "abrir", T0 + 30),
        paso("comprobante", "archivo", T0 + 31),
        paso("comprobante", "enviar", T0 + 32),
        paso("comprobante", "rechazado", T0 + 33),
      ]),
    ]);
    expect(r.embudos.cotizacion.map((p) => p.intentos)).toEqual([3, 2, 2, 1]);
    expect(r.embudos.comprobante.map((p) => p.intentos)).toEqual([1, 1, 1, 0]);
    expect(r.motivos.documentos).toEqual([
      { motivo: "Cerró la ventana sin enviar", veces: 1 },
      { motivo: "Sin señal al enviar", veces: 1 },
      { motivo: "La verificación lo rechazó", veces: 1 },
    ].sort((a, b) => b.veces - a.veces));
    expect(r.personas[0].documentosGuardados).toBe(1);
  });

  it("arma el embudo del código en caja y cuenta con qué se captura", () => {
    const r = calcularUso([
      lote(
        [
          paso("vale", "captura", T0, "pistola"),
          paso("vale", "resultado", T0 + 1, "no-existe"),
          paso("vale", "captura", T0 + 2, "teclado"),
          paso("vale", "resultado", T0 + 3, "ok"),
          paso("vale", "monto-invalido", T0 + 4),
          paso("vale", "confirmado", T0 + 5),
          paso("vale", "captura", T0 + 6, "camara"),
          paso("vale", "resultado", T0 + 7, "ok"),
          paso("camara", "abrir", T0 + 8),
          paso("camara", "sin-permiso", T0 + 9),
        ].map((e) => ({ ...e, p: "Validar código" })),
      ),
    ]);
    expect(r.embudos.vale.map((p) => p.intentos)).toEqual([3, 2, 1]);
    expect(r.motivos.vale.map((m) => m.motivo)).toEqual([
      "Código que no existe (mal tecleado o de otro producto)",
      "Código válido pero no confirmó la venta",
    ]);
    expect(r.medios.map((m) => m.motivo).sort()).toEqual(["Cámara", "Pistola de la caja", "Tecleado a mano"]);
    expect(r.camara).toContainEqual({ motivo: "Sin permiso de cámara", veces: 1 });
    expect(r.personas[0].codigosConfirmados).toBe(1);
  });
});

describe("grabaciones", () => {
  it("marca los momentos clave en orden", () => {
    const m = momentosDeSesion([
      paso("vale", "confirmado", T0 + 50),
      { t: "frustracion", p: "Mis clientes", x: 0, y: 0, w: 1, e: "Validar", n: 5, en: T0 + 10 },
      paso("cotizacion", "error", T0 + 20, "sin-senal"),
      paso("cotizacion", "aprobado", T0 + 30),
    ]);
    expect(m.map((x) => x.tipo)).toEqual(["frustracion", "rechazo", "guardado", "venta"]);
    expect(m[1].texto).toContain("Sin señal");
  });

  it("junta los toques de una pantalla solo del mismo tipo de equipo", () => {
    const p = puntosDePantalla(
      [
        lote([{ t: "toque", p: "Mis clientes", x: 10, y: 20, w: 1000, e: "a", en: T0 }]),
        lote([{ t: "toque", p: "Mis clientes", x: 5, y: 5, w: 400, e: "a", en: T0 }], { dispositivo: "celular" }),
        lote([{ t: "toque", p: "Reporte", x: 5, y: 5, w: 1000, e: "a", en: T0 }]),
      ],
      "Mis clientes",
      "escritorio",
    );
    expect(p).toEqual([{ x: 10, y: 20, w: 1000, f: false }]);
  });
});
