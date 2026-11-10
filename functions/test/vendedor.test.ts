import { describe, expect, it } from "vitest";
import {
  CAMPOS_VENDEDOR,
  clientesParaVendedor,
  conflictosDeRol,
  limpiarCorreos,
  proyectarParaVendedor,
} from "../src/vendedor/proyeccion";
import type { PayDeskDeal } from "../src/types/deal";

const deal = (extra: Partial<PayDeskDeal> = {}): PayDeskDeal =>
  ({
    dealId: "d1",
    concesionarioId: "t1",
    kiosco: "#0046 - TEQ CR",
    cliente: "Ana Martínez",
    fechaSolicitud: "2026-11-01T12:00:00.000Z",
    montoAprobado: 20000,
    estatusKyc: "2026-11-02T12:00:00.000Z",
    cotizacionEstatus: "completado",
    cotizacionUrl: "https://ejemplo/archivo",
    cotizacionPath: "deals/d1/cotizacion.pdf",
    cotizacionFechaEntregaAcordada: "2026-11-20",
    cotizacionMontoTotalCompra: 18450,
    cotizacionRevision: { estado: "rechazado", comentario: "nota interna" },
    creditoLiberadoFecha: "2026-11-05T12:00:00.000Z",
    disposicionCreditoFecha: null,
    comprobanteEntregaEstatus: "pendiente",
    comprobanteUrl: null,
    comprobanteFechaEntrega: null,
    comprobanteFirmaClienteConfirmada: null,
    desembolsoFecha: null,
    codigoVale: "1234567890",
    ...extra,
  }) as unknown as PayDeskDeal;

describe("lo que ve un vendedor externo", () => {
  it("solo trae los campos permitidos", () => {
    expect(Object.keys(proyectarParaVendedor(deal())).sort()).toEqual([...CAMPOS_VENDEDOR].sort());
  });

  it("trae el monto aprobado", () => {
    expect(proyectarParaVendedor(deal()).montoAprobado).toBe(20000);
  });

  it("nunca trae el total de la cotización, archivos, revisiones ni el vale", () => {
    const visto = JSON.stringify(proyectarParaVendedor(deal()));
    for (const secreto of ["18450", "archivo", "cotizacion.pdf", "nota interna", "1234567890", "TEQ"]) {
      expect(visto).not.toContain(secreto);
    }
  });

  it("deja fuera a los cancelados", () => {
    const clientes = clientesParaVendedor([deal(), deal({ dealId: "d2", cancelado: true })]);
    expect(clientes.map((c) => c.dealId)).toEqual(["d1"]);
  });

  it("conserva lo necesario para saber la etapa", () => {
    expect(proyectarParaVendedor(deal())).toMatchObject({
      cliente: "Ana Martínez",
      cotizacionEstatus: "completado",
      creditoLiberadoFecha: "2026-11-05T12:00:00.000Z",
      etapasExtra: {},
    });
  });
});

describe("correos de una tienda", () => {
  it("normaliza y quita repetidos", () => {
    expect(limpiarCorreos([" Ana@X.mx", "ana@x.mx", ""])).toEqual({ correos: ["ana@x.mx"] });
  });
  it("señala el correo inválido", () => {
    expect(limpiarCorreos(["ana@x.mx", "no-es-correo"])).toEqual({ invalido: "no-es-correo" });
  });
});

describe("cada persona tiene un solo perfil: acceso completo o vendedor", () => {
  const todas = [
    { concesionarioId: "t1", nombre: "Centro", usuarios: ["cajero@x.mx"], vendedores: [] },
    { concesionarioId: "t2", nombre: "El Marqués", usuarios: [], vendedores: ["vende@x.mx"] },
  ];

  it("sin cruces, no hay conflicto", () => {
    expect(conflictosDeRol("t1", ["cajero@x.mx", "nuevo@x.mx"], ["otro@x.mx"], todas)).toEqual([]);
  });

  it("no deja a alguien en las dos listas de la misma tienda", () => {
    expect(conflictosDeRol("t1", ["a@x.mx"], ["a@x.mx"], todas)).toHaveLength(1);
  });

  it("no deja hacer vendedor a quien ya tiene acceso completo en otra tienda", () => {
    const [m] = conflictosDeRol("t2", [], ["vende@x.mx", "cajero@x.mx"], todas);
    expect(m).toContain("cajero@x.mx ya tiene acceso completo en Centro");
  });

  it("no deja dar acceso completo a quien es vendedor en otra tienda", () => {
    const [m] = conflictosDeRol("t1", ["cajero@x.mx", "vende@x.mx"], [], todas);
    expect(m).toContain("vende@x.mx es asesor de ventas en El Marqués");
  });

  it("la tienda que se guarda se revisa con sus listas nuevas, no con las guardadas", () => {
    // Pasar a cajero@ de usuario a vendedor en su propia tienda sí se puede.
    expect(conflictosDeRol("t1", [], ["cajero@x.mx"], todas)).toEqual([]);
  });
});
