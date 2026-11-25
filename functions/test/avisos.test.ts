import { describe, expect, it } from "vitest";
import { construirMensaje } from "../src/notificaciones/notificar";
import { debeAvisar } from "../src/notificaciones/alertas";
import { atrasadas } from "../src/programadas/recordatorioRevisiones";
import { siguientesReintentos, ventanaDesde, MAX_REINTENTOS } from "../src/programadas/sincronizacionPeriodica";
import { validarDestino } from "../src/http/admin/notificaciones";
import { camposSinMapear } from "../src/programadas/revisionDiaria";
import { mensajeRechazoTienda } from "../src/ocr/validarDocumento";
import { construirUrlDeal } from "../src/hubspot/ligas";

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

describe("aviso de listo para desembolso", () => {
  const ctxDeal = { ...ctx, montoAprobado: 25000, montoCompra: 24500.5, desembolsoFecha: null };
  const url = "https://app.hubspot.com/contacts/123/record/0-3/9";

  it("trae los datos del desembolso y el botón al deal de HubSpot, no a la bandeja ni al archivo", () => {
    const m = construirMensaje(
      {
        evento: "comprobante_listo_desembolso",
        dealId: "9",
        fechaEntrega: "2026-11-24",
        verificadoPor: { como: "automatica" },
      },
      ctxDeal,
      "https://x.web.app/admin/revision",
      url,
    );
    const json = JSON.stringify(m.blocks);
    expect(m.texto).toContain("listo para desembolso");
    expect(m.texto).toContain("Construrama TEQ");
    expect(json).toContain("Juan &amp; &lt;Ana&gt;");
    expect(json).toContain("25,000.00");
    expect(json).toContain("24,500.50");
    expect(json).toContain("24/11/2026");
    expect(json).toContain("Verificación automática");
    expect(json).toContain("Abrir solicitud en HubSpot");
    expect(json).toContain(url);
    expect(json).not.toContain("/admin/revision");
    expect(json).not.toContain("ya tiene fecha de desembolso");
  });

  it("dice quién lo aprobó y advierte si ya se desembolsó", () => {
    const m = construirMensaje(
      {
        evento: "comprobante_listo_desembolso",
        dealId: "9",
        fechaEntrega: null,
        verificadoPor: { como: "revision", por: "ana@aviva.com" },
      },
      { ...ctxDeal, desembolsoFecha: "2026-11-20T15:00:00.000Z" },
      "u",
      url,
    );
    const json = JSON.stringify(m.blocks);
    expect(json).toContain("Aprobado en revisión por ana@aviva.com");
    expect(json).toContain("ya tiene fecha de desembolso (20/11/2026)");
  });

  it("sin liga a HubSpot sale igual, sin botón y con el ID del deal", () => {
    const m = construirMensaje(
      { evento: "comprobante_listo_desembolso", dealId: "9", fechaEntrega: null, verificadoPor: { como: "admin" } },
      ctxDeal,
      "u",
      null,
    );
    const json = JSON.stringify(m.blocks);
    expect(json).not.toContain('"type":"button"');
    expect(json).toContain("busca el deal 9");
  });

  it("arma la URL del deal con el portal y el dominio de su región", () => {
    expect(construirUrlDeal({ portalId: "123", uiDomain: "app-eu1.hubspot.com" }, "456")).toBe(
      "https://app-eu1.hubspot.com/contacts/123/record/0-3/456",
    );
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

describe("sincronización periódica", () => {
  const ahora = Date.parse("2026-10-09T12:00:00Z");
  it("arranca 10 min antes de la última corrida exitosa", () => {
    const r = ventanaDesde("2026-10-09T11:30:00Z", ahora);
    expect(r.desde.toISOString()).toBe("2026-10-09T11:20:00.000Z");
    expect(r.hueco).toBe(false);
  });
  it("si estuvo detenida más de 3 días, recorta y reporta el hueco", () => {
    const r = ventanaDesde("2026-10-01T00:00:00Z", ahora);
    expect(r.desde.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(r.hueco).toBe(true);
  });
  it("la primera corrida mira 3 días atrás sin reportar hueco", () => {
    expect(ventanaDesde(null, ahora).hueco).toBe(false);
  });
  it("un deal que falla se reintenta y se abandona al llegar al máximo", () => {
    const a = siguientesReintentos({ x: 1, y: MAX_REINTENTOS - 1, z: 2 }, ["x", "y"], ["z"]);
    expect(a.reintentos).toEqual({ x: 2 });
    expect(a.abandonados).toEqual(["y"]);
  });
});

describe("destinos de Slack", () => {
  it("normaliza el correo pero respeta las mayúsculas de un ID de usuario", () => {
    expect(validarDestino({ id: "1", tipo: "usuario", valor: "Ana@Aviva.com", eventos: [] }).valor).toBe(
      "ana@aviva.com",
    );
    expect(validarDestino({ id: "1", tipo: "usuario", valor: "U0123ABC", eventos: [] }).valor).toBe("U0123ABC");
  });
  it("rechaza un canal o usuario con formato inválido", () => {
    expect(() => validarDestino({ id: "1", tipo: "canal", valor: "no es canal", eventos: [] })).toThrow();
    expect(() => validarDestino({ id: "1", tipo: "usuario", valor: "ana", eventos: [] })).toThrow();
  });
});
