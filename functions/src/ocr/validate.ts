/**
 * Reglas puras sobre lo que Claude reportó de un documento (ocr/analizar.ts).
 * No tocan red ni Firestore, para poder probarlas aisladas. Las decisiones
 * viven aquí y no en el modelo: el modelo solo dice qué ve.
 *
 * Cada regla es de `rechazo` o de `revision`:
 * - `rechazo`: el archivo claramente no sirve (ilegible, no es el tipo de
 *   documento) y la tienda lo puede corregir sola subiendo el correcto. Se
 *   rechaza al momento, sin molestar a nadie.
 * - `revision`: algo no cuadra (monto, fecha, nombre, firma, archivo
 *   repetido, señales de edición). Puede ser un error de lectura o un
 *   intento de fraude, y eso lo decide una persona: el documento se guarda
 *   pero queda en revisión hasta que un administrador lo apruebe.
 */
import type { AnalisisDocumento } from "./analizar";

export type DocumentoTipo = "cotizacion" | "comprobante";
export type Severidad = "rechazo" | "revision";

export interface ResultadoRegla {
  id: string;
  ok: boolean;
  severidad: Severidad;
  /** Frase en español, lista para mostrarle a la tienda. */
  detalle: string;
  /**
   * Si el motivo se le enseña a la tienda. Los que señalan posible fraude
   * (archivo repetido, alteraciones) solo los ve el administrador: decirle
   * a quien falsificó un documento qué se notó es enseñarle a hacerlo mejor.
   */
  visibleParaTienda: boolean;
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
  const add = (
    id: string,
    ok: boolean,
    severidad: Severidad,
    si: string,
    no: string,
    visibleParaTienda = true,
  ) => reglas.push({ id, ok, severidad, detalle: ok ? si : no, visibleParaTienda });

  add(
    "duplicado",
    !ctx.duplicadoEn,
    "revision",
    "El archivo no se había usado antes.",
    `Este mismo archivo ya se subió en otra solicitud (${ctx.duplicadoEn}).`,
    false,
  );

  add(
    "legible",
    a.legible,
    "rechazo",
    "El documento es legible.",
    "No pudimos leer el documento. Sube una foto más nítida y completa, o el PDF original.",
  );

  // Con un documento ilegible el resto no dice nada: ya se rechazó por eso.
  if (a.legible) {
    add(
      "tipo",
      TIPOS_ACEPTADOS[tipo].includes(a.tipoDetectado),
      "rechazo",
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
        "revision",
        "El monto capturado aparece en el documento.",
        "El monto total capturado no coincide con el del documento. Revisa que sea el total de la cotización.",
      );
    }

    if (tipo === "comprobante") {
      add(
        "firma",
        a.tieneFirma !== false,
        "revision",
        "El comprobante tiene firma.",
        "No se ve la firma del cliente en el comprobante.",
      );
      if (ctx.fechaDeclarada) {
        add(
          "fecha",
          a.fechas.includes(ctx.fechaDeclarada),
          "revision",
          "La fecha de entrega aparece en el documento.",
          "La fecha de entrega capturada no aparece en el documento.",
        );
      }
    }

    if (ctx.cliente) {
      add(
        "cliente",
        a.nombreCliente != null && nombreCoincide(a.nombreCliente, ctx.cliente),
        "revision",
        "El nombre del cliente aparece en el documento.",
        "El nombre del cliente no aparece en el documento.",
      );
    }

    add(
      "alteracion",
      a.senalesAlteracion.length === 0,
      "revision",
      "Sin señales de alteración.",
      `Posibles señales de alteración: ${a.senalesAlteracion.join("; ")}`,
      false,
    );
  }

  const estado: EstadoOcr = reglas.some((r) => !r.ok && r.severidad === "rechazo")
    ? "rechazado"
    : reglas.some((r) => !r.ok)
      ? "revisar"
      : "aprobado";

  return { estado, reglas };
}
