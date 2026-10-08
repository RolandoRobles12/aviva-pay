/**
 * Reglas puras de validación sobre el texto que el OCR sacó de un
 * documento. No tocan red ni Firestore: reciben texto y datos conocidos del
 * deal y devuelven qué se cumplió y qué no, para poder probarlas aisladas.
 *
 * Cada regla es `bloqueante` (si falla, el documento se rechaza cuando el
 * modo es "bloquear") o `aviso` (solo marca el documento para revisión):
 * el OCR se equivoca con fotos torcidas y firmas encima del texto, así que
 * solo lo que no tiene explicación inocente bloquea.
 */

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

const MIN_CARACTERES = 40;

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Todos los importes que aparecen en el texto. Formato MX: coma de miles, punto decimal. */
export function extraerMontos(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Fechas (YYYY-MM-DD) que aparecen en el texto, en formato numérico o "12 de marzo de 2025". */
export function extraerFechas(texto: string): string[] {
  const out: string[] = [];
  const push = (d: number, m: number, y: number) => {
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || m < 1 || m > 12) return;
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  };
  for (const m of texto.matchAll(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  for (const m of texto.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  const sinAcentos = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const m of sinAcentos.matchAll(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de(?:l)?\s+)?(\d{4})/g)) {
    const mes = MESES.indexOf(m[2]) + 1;
    if (mes > 0) push(Number(m[1]), mes, Number(m[3]));
  }
  return out;
}

function nombreCoincide(texto: string, cliente: string): boolean {
  const tokens = normalizar(cliente).split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return true; // nada con qué comparar
  const t = ` ${normalizar(texto)} `;
  const encontrados = tokens.filter((tok) => t.includes(tok)).length;
  return encontrados / tokens.length >= 0.5;
}

function cuantasPalabras(texto: string, palabras: string[]): number {
  const t = normalizar(texto);
  return palabras.filter((p) => t.includes(p)).length;
}

const PALABRAS_COTIZACION = [
  "cotizacion", "presupuesto", "factura", "subtotal", "total", "iva",
  "folio", "cantidad", "precio", "importe", "descripcion", "rfc",
];
const PALABRAS_COMPROBANTE = [
  "entrega", "entregado", "recibi", "recibido", "conforme", "firma",
  "remision", "comprobante", "material", "cliente", "recibe",
];

export interface ContextoValidacion {
  tipo: DocumentoTipo;
  texto: string;
  /** Nombre del cliente según el deal. */
  cliente: string | null;
  /** Cotización: monto total que capturó la tienda. */
  montoDeclarado?: number | null;
  /** Comprobante: fecha de entrega que capturó la tienda (YYYY-MM-DD). */
  fechaDeclarada?: string | null;
  /** El mismo archivo ya se había subido a otra solicitud. */
  duplicadoEn?: string | null;
}

export function validarTexto(ctx: ContextoValidacion): {
  estado: EstadoOcr;
  reglas: ResultadoRegla[];
} {
  const { tipo, texto } = ctx;
  const reglas: ResultadoRegla[] = [];
  const add = (id: string, ok: boolean, severidad: Severidad, detalle: string) =>
    reglas.push({ id, ok, severidad, detalle });

  const legible = normalizar(texto).length >= MIN_CARACTERES;
  add(
    "legible",
    legible,
    "bloqueante",
    legible
      ? "El documento es legible."
      : "No pudimos leer texto en el archivo. Sube una foto más nítida o el PDF original.",
  );

  add(
    "duplicado",
    !ctx.duplicadoEn,
    "bloqueante",
    ctx.duplicadoEn
      ? "Este mismo archivo ya se subió en otra solicitud. Cada operación necesita su propio documento."
      : "El archivo no se había usado antes.",
  );

  // Con un texto ilegible el resto de las reglas no dice nada: ya se
  // rechazó por lo primero y no tiene caso inundar de motivos.
  if (legible) {
    if (tipo === "cotizacion") {
      if (ctx.montoDeclarado != null && ctx.montoDeclarado > 0) {
        const hay = extraerMontos(texto).some((n) => Math.abs(n - ctx.montoDeclarado!) < 0.011);
        add(
          "monto",
          hay,
          "bloqueante",
          hay
            ? "El monto capturado aparece en el documento."
            : "El monto total capturado no aparece en el documento. Revisa que sea el de la cotización.",
        );
      }
      const palabras = cuantasPalabras(texto, PALABRAS_COTIZACION);
      add(
        "palabras",
        palabras >= 3,
        "aviso",
        palabras >= 3
          ? "Tiene el formato de una cotización."
          : "El documento no parece una cotización o factura.",
      );
    } else {
      const palabras = cuantasPalabras(texto, PALABRAS_COMPROBANTE);
      add(
        "palabras",
        palabras >= 2,
        "aviso",
        palabras >= 2
          ? "Tiene el formato de un comprobante de entrega."
          : "El documento no parece un comprobante de entrega.",
      );
      if (ctx.fechaDeclarada) {
        const hay = extraerFechas(texto).includes(ctx.fechaDeclarada);
        add(
          "fecha",
          hay,
          "aviso",
          hay
            ? "La fecha de entrega aparece en el documento."
            : "La fecha de entrega capturada no aparece en el documento.",
        );
      }
    }

    if (ctx.cliente) {
      const ok = nombreCoincide(texto, ctx.cliente);
      add(
        "cliente",
        ok,
        "aviso",
        ok
          ? "El nombre del cliente aparece en el documento."
          : "El nombre del cliente no aparece en el documento.",
      );
    }
  }

  const estado: EstadoOcr = reglas.some((r) => !r.ok && r.severidad === "bloqueante")
    ? "rechazado"
    : reglas.some((r) => !r.ok)
      ? "revisar"
      : "aprobado";

  return { estado, reglas };
}
