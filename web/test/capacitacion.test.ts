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
} from "../src/capacitacion/progreso";
import { LECCIONES } from "../src/capacitacion/lecciones";
import { PREGUNTAS_FRECUENTES } from "../src/capacitacion/referencia";
import {
  CLIENTE_RECHAZADO,
  dealsIniciales,
  mensajeRechazo,
  rolloutPractica,
  subirPractica,
} from "../src/capacitacion/datosTiendaPractica";
import { aplicarFiltros, FILTROS_INICIALES } from "../src/components/DealFilters";
import { requiereAccion, scopeOf } from "../src/lib/dealScope";
import {
  CODIGOS_PRACTICA,
  errorMontoPractica,
  validarPractica,
} from "../src/capacitacion/simulador";
// La lista contra la que el backend acepta avances. Si no coinciden, una
// lección nueva nunca se podría guardar, o el panel contaría contra otro total.
import { LECCIONES_CAPACITACION, LECCIONES_VENDEDOR as VENDEDOR_BACKEND } from "../../functions/src/capacitacion/lecciones";
import { ORDEN_VENDEDOR, esLeccionId } from "../src/capacitacion/progreso";
import { LECCIONES_VENDEDOR, PREGUNTAS_VENDEDOR } from "../src/capacitacion/leccionesVendedor";
import { clientesPracticaVendedor } from "../src/capacitacion/VendedorPractica";
import { etapaActual } from "../src/lib/dealScope";

describe("contenido de la capacitación", () => {
  it("el frontend y el backend tienen las mismas lecciones, en el mismo orden", () => {
    expect([...ORDEN_LECCIONES]).toEqual([...LECCIONES_CAPACITACION]);
  });

  it("cada lección del orden tiene contenido, y en el mismo orden", () => {
    expect(LECCIONES.map((l) => l.id)).toEqual([...ORDEN_LECCIONES]);
  });

  it("las lecciones que enseñan una tarea tienen práctica", () => {
    const conPractica = LECCIONES.filter((l) => l.Practica).map((l) => l.id);
    expect(conPractica).toEqual(["mis-clientes", "documentos", "validar-codigo"]);
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
      siguiente: "tienda-inicio",
    });
  });

  it("la siguiente es la primera sin pasar, aunque se hayan saltado lecciones", () => {
    expect(calcularAvance(["tienda-inicio", "documentos"]).siguiente).toBe("mis-clientes");
  });

  it("ignora ids que ya no existen", () => {
    expect(calcularAvance(["tienda-inicio", "leccion-retirada"]).hechas).toBe(1);
  });

  it("completa con todas", () => {
    expect(calcularAvance([...ORDEN_LECCIONES])).toMatchObject({
      completa: true,
      porcentaje: 100,
      siguiente: null,
    });
  });

  it("la lección que sigue y el final del curso", () => {
    expect(leccionSiguiente("tienda-inicio")).toBe("mis-clientes");
    expect(leccionSiguiente(ORDEN_LECCIONES[ORDEN_LECCIONES.length - 1])).toBeNull();
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

describe("tienda de práctica", () => {
  // A mitad de mes, para que "este mes" y "mes pasado" no dependan del día.
  const hoy = new Date(2026, 10, 15, 12);
  const deals = dealsIniciales(hoy);
  const rollout = rolloutPractica(hoy);
  const id = (d: { dealId: string }[]) => d.map((x) => x.dealId);

  it("con los filtros de entrada, Pedro (mes pasado) y Jorge (anterior) no se ven", () => {
    const visibles = id(aplicarFiltros(deals, FILTROS_INICIALES, rollout));
    expect(visibles).not.toContain("pedro");
    expect(visibles).not.toContain("jorge");
    expect(visibles).toContain("ana");
  });

  it("con “Mes pasado” aparece Pedro; con “Todo” y “Anteriores”, Jorge", () => {
    expect(id(aplicarFiltros(deals, { ...FILTROS_INICIALES, periodo: "mes-pasado" }, rollout))).toContain("pedro");
    expect(
      id(aplicarFiltros(deals, { ...FILTROS_INICIALES, periodo: "todo", estado: "historicas" }, rollout)),
    ).toEqual(["jorge"]);
  });

  it("Jorge es anterior y no se le pide nada; Ana sí espera un documento", () => {
    const d = (x: string) => deals.find((y) => y.dealId === x)!;
    expect(scopeOf(d("jorge"), rollout)).toBe("historica");
    expect(requiereAccion(d("jorge"), rollout)).toBe(false);
    expect(requiereAccion(d("ana"), rollout)).toBe(true);
  });

  it("subir la cotización la completa con lo capturado", () => {
    const { deals: nuevos, resultado } = subirPractica(deals, {
      tipo: "cotizacion",
      dealId: "ana",
      fecha: "2026-11-20",
      montoTotalCompra: "18450",
    });
    expect(resultado).toEqual({ ok: true, enRevision: false, reemplazo: false });
    const ana = nuevos.find((d) => d.dealId === "ana")!;
    expect(ana.cotizacionEstatus).toBe("completado");
    expect(ana.cotizacionMontoTotalCompra).toBe(18_450);
    expect(requiereAccion(ana, rollout)).toBe(true); // falta el comprobante
  });

  it("corregir una cotización ya subida es un reemplazo", () => {
    const una = subirPractica(deals, { tipo: "cotizacion", dealId: "ana", fecha: "2026-11-20", montoTotalCompra: "1" });
    const dos = subirPractica(una.deals, { tipo: "cotizacion", dealId: "ana", fecha: "2026-11-20", montoTotalCompra: "2" });
    expect(dos.resultado).toMatchObject({ ok: true, reemplazo: true });
  });

  it("el cliente rechazado ofrece verificación manual al segundo rechazo, y luego queda en revisión", () => {
    const s = { tipo: "cotizacion" as const, dealId: CLIENTE_RECHAZADO, fecha: "2026-11-20", montoTotalCompra: "1" };
    const r1 = subirPractica(deals, s);
    expect(r1.resultado).toEqual({ ok: false, mensaje: mensajeRechazo("cotizacion"), revisionManualDisponible: false });
    const r2 = subirPractica(r1.deals, s);
    expect(r2.resultado).toMatchObject({ ok: false, revisionManualDisponible: true });
    const r3 = subirPractica(r2.deals, { ...s, solicitudManual: true });
    expect(r3.resultado).toEqual({ ok: true, enRevision: true, reemplazo: false });
    const rosa = r3.deals.find((d) => d.dealId === CLIENTE_RECHAZADO)!;
    expect(rosa.cotizacionRevision?.solicitudManual).toBe(true);
    expect(rosa.cotizacionEstatus).toBe("pendiente");
  });

  it("el mensaje de rechazo concuerda en género", () => {
    expect(mensajeRechazo("cotizacion")).toContain("la cotización correcta");
    expect(mensajeRechazo("comprobante")).toContain("el comprobante de entrega correcto");
  });
});

describe("curso del vendedor", () => {
  it("el frontend y el backend tienen las mismas lecciones, en el mismo orden", () => {
    expect([...ORDEN_VENDEDOR]).toEqual([...VENDEDOR_BACKEND]);
    expect(LECCIONES_VENDEDOR.map((l) => l.id)).toEqual([...ORDEN_VENDEDOR]);
  });

  it("sus ids no chocan con los del curso de la tienda", () => {
    for (const id of ORDEN_VENDEDOR) expect(esLeccionId(id)).toBe(false);
  });

  it("las preguntas frecuentes ligan solo a lecciones de su curso", () => {
    for (const p of PREGUNTAS_VENDEDOR) {
      if (p.leccion) expect(esLeccionId(p.leccion, ORDEN_VENDEDOR), p.pregunta).toBe(true);
    }
  });

  it("los clientes de práctica cubren cada etapa, para que cada filtro tenga a alguien", () => {
    const actuales = new Set(clientesPracticaVendedor().map((c) => etapaActual(c).actual?.id));
    for (const id of ["solicitud", "kyc", "cotizacion", "credito", "disposicion", "comprobante", "desembolso"]) {
      expect(actuales.has(id), id).toBe(true);
    }
  });
});
