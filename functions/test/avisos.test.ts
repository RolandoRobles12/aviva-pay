import { describe, expect, it } from "vitest";
import { construirMensaje } from "../src/notificaciones/notificar";
import { debeAvisar } from "../src/notificaciones/alertas";
import { atrasadas } from "../src/programadas/recordatorioRevisiones";
import { camposSinMapear } from "../src/programadas/revisionDiaria";
import { mensajeRechazoTienda } from "../src/ocr/validarDocumento";

const ctx = { cliente: "Juan & <Ana>", tienda: "Construrama TEQ" };

describe("construirMensaje", () => {
  it("escapa lo que Slack interpreta y lleva a la bandeja, nunca al archivo", () => {
    const m = construirMensaje(
      { evento: "documento_en_revision", dealId: "9", tipo: "cotizacion", motivos: ["monto <total>"] },
      ctx,
      "https://x.web.app/admin/revision",
    );
    const json = JSON.stringify(m.blocks);
    expect(json).toContain("Juan &amp; &lt;Ana&gt;");
    expect(json).toContain("monto &lt;total&gt;");
    expect(json).toContain("https://x.web.app/admin/revision");
    expect(json).not.toContain("storage.googleapis.com");
  });

  it("arma el aviso de error del sistema sin deal", () => {
    const m = construirMensaje({ evento: "error_sistema", titulo: "Falló X", detalle: "boom" }, null, "u");
    expect(m.texto).toContain("Falló X");
  });

  it("el recordatorio de revisión atrasada trae botón", () => {
    const m = construirMensaje({ evento: "revision_atrasada", dealId: "9", tipo: "comprobante", horas: 6 }, ctx, "u");
    expect(JSON.stringify(m.blocks)).toContain("Abrir revisión");
  });
});

describe("alertas agrupadas", () => {
  it("avisa la primera vez y después solo pasada la ventana", () => {
    expect(debeAvisar(null, 0, 30)).toBe(true);
    expect(debeAvisar(0, 29 * 60_000, 30)).toBe(false);
    expect(debeAvisar(0, 30 * 60_000, 30)).toBe(true);
  });
});

describe("recordatorio de revisiones", () => {
  const ahora = Date.parse("2026-10-09T12:00:00Z");
  it("avisa solo lo que pasó el umbral y no se ha recordado", () => {
    expect(
      atrasadas(
        [
          { subidoEn: "2026-10-09T07:00:00Z", recordatorioEn: null },
          { subidoEn: "2026-10-09T10:00:00Z", recordatorioEn: null },
          { subidoEn: "2026-10-09T01:00:00Z", recordatorioEn: "2026-10-09T05:00:00Z" },
        ],
        ahora,
        4,
      ),
    ).toEqual([true, false, false]);
  });
  it("0 horas lo apaga", () => {
    expect(atrasadas([{ subidoEn: "2020-01-01T00:00:00Z", recordatorioEn: null }], ahora, 0)).toEqual([false]);
  });
});

describe("campos sin mapear", () => {
  it("detecta los TODO_ y los vacíos", () => {
    expect(camposSinMapear({ a: "TODO_a", b: "real", c: "" })).toEqual(["a", "c"]);
  });
});

describe("mensaje de rechazo a la tienda", () => {
  it("es genérico: pide volver a subir sin decir qué se detectó", () => {
    const m = mensajeRechazoTienda("cotizacion");
    expect(m).toMatch(/vuelve a subirlo/);
    expect(m).not.toMatch(/alteraci|repetido|Claude/i);
  });
});
