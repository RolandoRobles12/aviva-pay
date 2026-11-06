import { describe, expect, it, vi } from "vitest";

// Las lecciones incluyen el simulador, que reutiliza la pantalla de la caja,
// y esa importa las llamadas a Firebase. Aquí solo se revisa el contenido:
// ninguna prueba llama al servidor.
vi.mock("../src/lib/firebase", () => ({
  validarValeCallable: vi.fn(),
  confirmarDisposicionCallable: vi.fn(),
}));
import {
  ORDEN_LECCIONES,
  calcularAvance,
  capacitacionDeTienda,
  coincideBusqueda,
  leccionSiguiente,
  quizAprobado,
} from "../src/capacitacion/progreso";
import { LECCIONES } from "../src/capacitacion/lecciones";
import { PREGUNTAS_FRECUENTES } from "../src/capacitacion/referencia";
import {
  CODIGOS_PRACTICA,
  errorMontoPractica,
  validarPractica,
} from "../src/capacitacion/simulador";
// La lista contra la que el backend acepta avances. Si no coinciden, una
// lección nueva nunca se podría guardar, o el panel contaría contra otro total.
import { LECCIONES_CAPACITACION } from "../../functions/src/capacitacion/lecciones";

describe("contenido de la capacitación", () => {
  it("el frontend y el backend tienen las mismas lecciones, en el mismo orden", () => {
    expect([...ORDEN_LECCIONES]).toEqual([...LECCIONES_CAPACITACION]);
  });

  it("cada lección del orden tiene contenido, y en el mismo orden", () => {
    expect(LECCIONES.map((l) => l.id)).toEqual([...ORDEN_LECCIONES]);
  });

  it("cada pregunta tiene exactamente una respuesta correcta y explica cada opción", () => {
    for (const l of LECCIONES) {
      expect(l.preguntas.length, l.id).toBeGreaterThan(0);
      for (const p of l.preguntas) {
        expect(p.opciones.filter((o) => o.correcta).length, `${l.id}/${p.id}`).toBe(1);
        expect(p.opciones.length, `${l.id}/${p.id}`).toBeGreaterThanOrEqual(2);
        for (const o of p.opciones) {
          expect(o.explicacion.trim(), `${l.id}/${p.id}`).not.toBe("");
          // La pantalla ya antepone "Correcto." / "No exactamente.".
          expect(o.explicacion, `${l.id}/${p.id}`).not.toMatch(/^(Correcto|No exactamente)\b/);
        }
      }
    }
  });

  it("los ids de pregunta no se repiten dentro de una lección", () => {
    for (const l of LECCIONES) {
      const ids = l.preguntas.map((p) => p.id);
      expect(new Set(ids).size, l.id).toBe(ids.length);
    }
  });

  it("las preguntas frecuentes no se repiten", () => {
    const preguntas = PREGUNTAS_FRECUENTES.map((p) => p.pregunta);
    expect(new Set(preguntas).size).toBe(preguntas.length);
  });
});

describe("avance", () => {
  it("sin nada hecho, la siguiente es la primera", () => {
    expect(calcularAvance([])).toMatchObject({
      hechas: 0,
      porcentaje: 0,
      completa: false,
      siguiente: "bienvenida",
    });
  });

  it("la siguiente es la primera sin pasar, aunque se hayan saltado lecciones", () => {
    expect(calcularAvance(["bienvenida", "cotizacion"]).siguiente).toBe("acceso");
  });

  it("ignora ids que ya no existen", () => {
    expect(calcularAvance(["bienvenida", "leccion-retirada"]).hechas).toBe(1);
  });

  it("completa con todas", () => {
    expect(calcularAvance([...ORDEN_LECCIONES])).toMatchObject({
      completa: true,
      porcentaje: 100,
      siguiente: null,
    });
  });

  it("la lección que sigue y el final del curso", () => {
    expect(leccionSiguiente("bienvenida")).toBe("acceso");
    expect(leccionSiguiente(ORDEN_LECCIONES[ORDEN_LECCIONES.length - 1])).toBeNull();
  });
});

describe("examen", () => {
  const correctas = { a: 1, b: 0 };
  it("se aprueba solo con todas correctas", () => {
    expect(quizAprobado(correctas, { a: 1, b: 0 })).toBe(true);
    expect(quizAprobado(correctas, { a: 1 })).toBe(false);
    expect(quizAprobado(correctas, { a: 1, b: 1 })).toBe(false);
  });
  it("un examen sin preguntas no se da por aprobado", () => {
    expect(quizAprobado({}, {})).toBe(false);
  });
});

describe("búsqueda en preguntas frecuentes", () => {
  it("no distingue acentos ni mayúsculas", () => {
    expect(coincideBusqueda("La pistola no lee el código", "CODIGO pistola")).toBe(true);
  });
  it("pide todas las palabras", () => {
    expect(coincideBusqueda("La pistola no lee el código", "pistola contraseña")).toBe(false);
  });
  it("sin búsqueda, todo coincide", () => {
    expect(coincideBusqueda("lo que sea", "  ")).toBe(true);
  });
});

describe("capacitación por tienda (panel)", () => {
  const porCorreo = {
    "ana@tienda.mx": { completadas: 8, total: 8 },
    "luis@tienda.mx": { completadas: 3, total: 8 },
    "eva@tienda.mx": { completadas: 0, total: 8 },
  };
  it("separa completas, en curso y sin empezar, y compara correos en minúsculas", () => {
    expect(
      capacitacionDeTienda(["Ana@Tienda.mx", "luis@tienda.mx", "eva@tienda.mx", "nuevo@tienda.mx"], porCorreo),
    ).toEqual({ personas: 4, completas: 1, enCurso: 1, sinEmpezar: 2 });
  });
  it("quien terminó un curso que después creció queda en curso", () => {
    expect(capacitacionDeTienda(["a@x.mx"], { "a@x.mx": { completadas: 8, total: 9 } }).enCurso).toBe(1);
  });
});

describe("simulador de caja", () => {
  it("cada código de práctica da una respuesta distinta de 'no existe', salvo el mal tecleado", () => {
    const estados = CODIGOS_PRACTICA.map((c) => validarPractica(c.codigo)?.estado);
    expect(estados).toEqual(["ok", "ok", "ya-utilizado", "otra-tienda", "vencido", "cancelado", "no-existe"]);
  });
  it("acepta el código con espacio, como lo trae el vale", () => {
    expect(validarPractica("12345 67890")?.estado).toBe("ok");
  });
  it("con menos de 10 dígitos no responde, igual que la caja real", () => {
    expect(validarPractica("12345")).toBeNull();
  });
  it("el segundo código enseña lecturas previas", () => {
    const r = validarPractica("2222222222");
    expect(r?.estado === "ok" && r.lecturasPrevias).toBeGreaterThan(0);
  });
  it("aplica la misma regla de monto que el backend", () => {
    expect(errorMontoPractica(0, 25_000)).toMatch(/Captura el monto/);
    expect(errorMontoPractica(25_000.01, 25_000)).toMatch(/no puede ser mayor/);
    expect(errorMontoPractica(19_300, 25_000)).toBeNull();
    expect(errorMontoPractica(25_000, 25_000)).toBeNull();
  });
});
