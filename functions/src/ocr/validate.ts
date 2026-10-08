/**
 * Reglas puras sobre lo que Claude reportó de un documento (ocr/analizar.ts).
 * No tocan red ni Firestore, para poder probarlas aisladas. Las decisiones
 * viven aquí y no en el modelo: el modelo solo dice qué ve.
 *
 * Cada regla es `bloqueante` (si falla, el documento se rechaza cuando el
 * modo es "bloquear") o `aviso` (solo lo marca para revisión). Bloquea solo
 * lo que no tiene explicación inocente; lo que depende de un juicio fino
 * (¿hay firma?, ¿se ve editado?) lo revisa una persona.
 */
import type { AnalisisDocumento } from "./analizar";

export type DocumentoTipo = "cotizacion" | "comprobante";
export type Severidad = "bloqueante" | "aviso";

export interface ResultadoRegla {
  id: string;
  ok: boolean;
  severidad: Severidad;
  /** Frase en español, lista para mostrarle a la tienda. */
  detalle: string;
}

export type EstadoOcr = "aprobado" | "revisar" | "rechazado";

const TIPOS_ACEPTADOS: Record<DocumentoTipo, AnalisisDocumento["tipoDetectado"][]> = {
  cotizacion: ["cotizacion", "factura", "nota_de_venta"],
  comprobante: ["comprobante_de_entrega", "nota_de_remision"],
};

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Al menos la mitad de las palabras del nombre del deal aparecen en el que leyó Claude. */
export function nombreCoincide(leido: string, cliente: string): boolean {
  const tokens = normalizar(cliente).split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  const t = ` ${normalizar(leido)} `;
  return tokens.filter((tok) => t.includes(` ${tok} `)).length / tokens.length >= 0.5;
}

const igualMonto = (a: number, b: number) => Math.abs(a - b) < 0.011;

export interface ContextoValidacion {
  tipo: DocumentoTipo;
  analisis: AnalisisDocumento;
  /** Nombre del cliente según el deal. */
  cliente: string | null;
  /** Cotización: monto total que capturó la tienda. */
  montoDeclarado?: number | null;
  /** Comprobante: fecha de entrega que capturó la tienda (YYYY-MM-DD). */
  fechaDeclarada?: string | null;
  /** El mismo archivo ya se había subido a otra solicitud. */
  duplicadoEn?: string | null;
}

export function validarAnalisis(ctx: ContextoValidacion): {
  estado: EstadoOcr;
  reglas: ResultadoRegla[];
} {
  const { tipo, analisis: a } = ctx;
  const reglas: ResultadoRegla[] = [];
  const add = (id: string, ok: boolean, severidad: Severidad, si: string, no: string) =>
    reglas.push({ id, ok, severidad, detalle: ok ? si : no });

  add(
    "duplicado",
    !ctx.duplicadoEn,
    "bloqueante",
    "El archivo no se había usado antes.",
    "Este mismo archivo ya se subió en otra solicitud. Cada operación necesita su propio documento.",
  );

  add(
    "legible",
    a.legible,
    "bloqueante",
    "El documento es legible.",
    "No pudimos leer el documento. Sube una foto más nítida y completa, o el PDF original.",
  );

  // Con un documento ilegible el resto no dice nada: ya se rechazó por eso.
  if (a.legible) {
    add(
      "tipo",
      TIPOS_ACEPTADOS[tipo].includes(a.tipoDetectado),
      "bloqueante",
      "El tipo de documento corresponde.",
      tipo === "cotizacion"
        ? "El archivo no parece una cotización, factura o nota de venta."
        : "El archivo no parece un comprobante de entrega o nota de remisión.",
    );

    if (tipo === "cotizacion" && ctx.montoDeclarado != null && ctx.montoDeclarado > 0) {
      const m = ctx.montoDeclarado;
      const hay =
        (a.montoTotal != null && igualMonto(a.montoTotal, m)) ||
        a.montos.some((n) => igualMonto(n, m));
      add(
        "monto",
        hay,
        "bloqueante",
        "El monto capturado aparece en el documento.",
        "El monto total capturado no coincide con el del documento. Revisa que sea el total de la cotización.",
      );
    }

    if (tipo === "comprobante") {
      add(
        "firma",
        a.tieneFirma !== false,
        "aviso",
        "El comprobante tiene firma.",
        "No se ve la firma del cliente en el comprobante.",
      );
      if (ctx.fechaDeclarada) {
        add(
          "fecha",
          a.fechas.includes(ctx.fechaDeclarada),
          "aviso",
          "La fecha de entrega aparece en el documento.",
          "La fecha de entrega capturada no aparece en el documento.",
        );
      }
    }

    if (ctx.cliente) {
      add(
        "cliente",
        a.nombreCliente != null && nombreCoincide(a.nombreCliente, ctx.cliente),
        "aviso",
        "El nombre del cliente aparece en el documento.",
        "El nombre del cliente no aparece en el documento.",
      );
    }

    add(
      "alteracion",
      a.senalesAlteracion.length === 0,
      "aviso",
      "Sin señales de alteración.",
      `Posibles señales de alteración: ${a.senalesAlteracion.join("; ")}`,
    );
  }

  const estado: EstadoOcr = reglas.some((r) => !r.ok && r.severidad === "bloqueante")
    ? "rechazado"
    : reglas.some((r) => !r.ok)
      ? "revisar"
      : "aprobado";

  return { estado, reglas };
}
