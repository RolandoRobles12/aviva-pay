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

import * as catalogoPortal from "../src/lib/catalogoUso";
import * as catalogoServidor from "../../functions/src/uso/catalogo";
import { armarLotes, podar, quitarLote, type EnCola } from "../src/lib/colaUso";

describe("catálogo de eventos", () => {
  it("el portal y el servidor tienen el mismo catálogo", () => {
    expect(catalogoPortal.VERSION_ESQUEMA).toBe(catalogoServidor.VERSION_ESQUEMA);
    expect(catalogoPortal.FLUJOS).toEqual(catalogoServidor.FLUJOS);
    expect(catalogoPortal.PASOS).toEqual(catalogoServidor.PASOS);
    expect(catalogoPortal.DISPOSITIVOS).toEqual(catalogoServidor.DISPOSITIVOS);
  });
});

describe("cola de eventos en el equipo", () => {
  const ev = (i: string, u = "u1", s = "s1", en = 1000): EnCola => ({ i, u, s, d: "escritorio", e: { en } });
  let n = 0;
  const nuevoId = () => `lote-${++n}`;

  it("arma lotes por sesión y de a lo más N", () => {
    n = 0;
    const { lotes } = armarLotes([ev("a"), ev("b"), ev("c"), ev("d", "u1", "s2")], "u1", 2, nuevoId);
    expect(lotes.map((l) => [l.sesionId, l.eventos.map((g) => g.i)])).toEqual([
      ["s1", ["a", "b"]],
      ["s1", ["c"]],
      ["s2", ["d"]],
    ]);
  });

  it("un reintento manda el mismo lote con el mismo id, y lo nuevo va en otro", () => {
    n = 0;
    const primero = armarLotes([ev("a"), ev("b")], "u1", 10, nuevoId);
    // El envío falló: la cola guardada conserva el lote asignado, y llegó un evento nuevo.
    const segundo = armarLotes([...primero.cola, ev("c")], "u1", 10, nuevoId);
    expect(segundo.lotes.map((l) => [l.id, l.eventos.map((g) => g.i)])).toEqual([
      [primero.lotes[0].id, ["a", "b"]],
      ["lote-2", ["c"]],
    ]);
  });

  it("no arma lotes con lo de otra persona", () => {
    const { lotes, cola } = armarLotes([ev("a", "otra")], "u1", 10, nuevoId);
    expect(lotes).toEqual([]);
    expect(cola[0].l).toBeUndefined();
  });

  it("al confirmar quita ese lote, también si otra pestaña le borró el id", () => {
    n = 0;
    const { cola, lotes } = armarLotes([ev("a"), ev("b")], "u1", 10, nuevoId);
    const reescrita = [{ ...cola[0], l: undefined }, cola[1], ev("c")];
    expect(quitarLote(reescrita, lotes[0]).map((g) => g.i)).toEqual(["c"]);
  });

  it("lo de otra persona se guarda hasta 7 días y la cola tiene tope", () => {
    const dia = 86_400_000;
    const cola = [ev("viejo", "otra", "s", 0), ev("reciente", "otra", "s", 6 * dia), ev("mio", "u1", "s", 0)];
    expect(podar(cola, "u1", 7.5 * dia, { max: 10, viejoMs: 7 * dia }).map((g) => g.i)).toEqual(["reciente", "mio"]);
    expect(podar([ev("1"), ev("2"), ev("3")], "u1", 0, { max: 2, viejoMs: dia }).map((g) => g.i)).toEqual(["2", "3"]);
  });
});
