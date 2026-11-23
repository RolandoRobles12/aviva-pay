import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/firebase", () => ({
  auth: { currentUser: null },
  registrarInteraccionesCallable: vi.fn(),
}));

import {
  DetectorFrustracion,
  dispositivoPorAncho,
  esPractica,
  limpiarTexto,
  motivoDeError,
  nombrePantalla,
} from "../src/lib/analitica";

describe("medición de uso del portal", () => {
  it("nombra las pantallas por ruta, sin ids de clientes", () => {
    expect(nombrePantalla("/solicitudes")).toBe("Mis clientes");
    expect(nombrePantalla("/solicitudes/validar")).toBe("Validar código");
    expect(nombrePantalla("/solicitudes/aprende/validar-codigo")).toBe("Aprende · validar-codigo");
    expect(nombrePantalla("/consulta")).toBe("Asesor · Clientes");
    expect(nombrePantalla("/algo/raro")).toBe("Otra");
  });

  it("no cuenta como uso real lo que pasa en los simuladores de la capacitación", () => {
    expect(esPractica("Aprende · documentos")).toBe(true);
    expect(esPractica("Asesor · Aprende")).toBe(true);
    expect(esPractica("Mis clientes › Subir cotización")).toBe(false);
  });

  it("las etiquetas pierden números y correos", () => {
    expect(limpiarTexto("Aprende 3/8")).toBe("Aprende #/#");
    expect(limpiarTexto("Escribir a ana@tienda.mx")).toBe("Escribir a [correo]");
  });

  it("clasifica el equipo por ancho", () => {
    expect(dispositivoPorAncho(390)).toBe("celular");
    expect(dispositivoPorAncho(800)).toBe("tablet");
    expect(dispositivoPorAncho(1440)).toBe("escritorio");
  });

  it("clasifica por qué no se pudo subir un documento", () => {
    expect(motivoDeError(new TypeError("Failed to fetch"), true)).toBe("sin-senal");
    expect(motivoDeError(new Error("lo que sea"), false)).toBe("sin-senal");
    expect(motivoDeError(new Error("Tu sesión expiró. Vuelve a iniciar sesión."), true)).toBe("sesion");
    expect(motivoDeError(new Error("Demasiados intentos seguidos."), true)).toBe("limite");
    expect(motivoDeError(new Error("No se pudo guardar"), true)).toBe("servidor");
  });

  describe("toques de frustración", () => {
    it("3 toques en 1 s en el mismo lugar son una ráfaga, que se reporta una vez al terminar", () => {
      const d = new DetectorFrustracion();
      expect(d.tocar(100, 100, 0, "Validar")).toBeNull();
      expect(d.tocar(105, 102, 200, "Validar")).toBeNull();
      expect(d.tocar(98, 99, 400, "Validar")).toBeNull();
      expect(d.tocar(101, 100, 600, "Validar")).toBeNull();
      expect(d.vencida(1000)).toBeNull();
      expect(d.vencida(1700)).toEqual({ x: 98, y: 99, n: 4, e: "Validar" });
      expect(d.vencida(5000)).toBeNull();
    });

    it("toques separados o lejos no cuentan", () => {
      const d = new DetectorFrustracion();
      d.tocar(0, 0, 0, "a");
      d.tocar(300, 300, 100, "b");
      d.tocar(0, 0, 1500, "a");
      d.tocar(0, 0, 3000, "a");
      expect(d.vencida(10_000, true)).toBeNull();
    });

    it("un toque en otro lugar cierra la ráfaga anterior", () => {
      const d = new DetectorFrustracion();
      d.tocar(10, 10, 0, "x");
      d.tocar(10, 10, 100, "x");
      d.tocar(10, 10, 200, "x");
      expect(d.tocar(500, 500, 300, "y")).toMatchObject({ n: 3, e: "x" });
    });
  });
});
