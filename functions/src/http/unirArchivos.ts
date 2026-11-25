import { PDFDocument } from "pdf-lib";

/**
 * Un documento puede llegar en varios archivos: las dos caras de un
 * comprobante de entrega firmado, o una cotización de varias hojas
 * fotografiadas una por una. Aquí se unen en un solo PDF, una página por
 * foto (y todas las páginas de cada PDF), en el orden en que la tienda los
 * eligió. Así todo lo que sigue — la verificación con Claude, la copia en
 * HubSpot, "Ver archivo" y la detección de archivos repetidos — trabaja
 * igual que con un solo archivo, y el administrador ve exactamente lo que
 * se verificó.
 *
 * Un solo archivo pasa intacto. Una factura XML solo se acepta sola: es
 * texto, no tiene páginas que juntar.
 */
export const MAX_ARCHIVOS = 5;

/** La tienda mandó una combinación de archivos que no se puede unir; el mensaje es para ella. */
export class ArchivosInvalidosError extends Error {}

interface Archivo {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}

type Formato = "pdf" | "jpg" | "png" | "xml" | "otro";

/** Por los primeros bytes, no por el nombre: un .jpg puede ser un PNG renombrado. */
export function formatoDe(archivo: Archivo): Formato {
  const b = archivo.buffer;
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  const mime = (archivo.mimeType ?? "").toLowerCase();
  if (mime.includes("xml") || archivo.fileName.toLowerCase().endsWith(".xml")) return "xml";
  return "otro";
}

/**
 * Puntos de PDF por pixel de la foto: el equivalente a 150 dpi. Una foto de
 * 2400 px (el tope del portal, ver web/src/lib/imagenes.ts) queda en una
 * página de unos 40 cm de lado, que se lee completa al abrirla.
 */
const PUNTOS_POR_PIXEL = 72 / 150;

function nombreUnido(archivos: Archivo[]): string {
  const base = archivos[0].fileName.replace(/\.[^.]+$/, "") || "documento";
  return `${base}-y-${archivos.length - 1}-mas.pdf`;
}

export async function unirArchivos(archivos: Archivo[]): Promise<Archivo> {
  if (archivos.length === 0) {
    throw new ArchivosInvalidosError("Selecciona al menos un archivo.");
  }
  if (archivos.length > MAX_ARCHIVOS) {
    throw new ArchivosInvalidosError(`Sube máximo ${MAX_ARCHIVOS} archivos por documento.`);
  }
  if (archivos.length === 1) return archivos[0];

  const formatos = archivos.map(formatoDe);
  if (formatos.includes("xml")) {
    throw new ArchivosInvalidosError(
      "Una factura XML se sube sola. Para subir varias hojas, usa fotos o PDF.",
    );
  }

  const unido = await PDFDocument.create();
  for (const [i, archivo] of archivos.entries()) {
    const formato = formatos[i];
    try {
      if (formato === "pdf") {
        const origen = await PDFDocument.load(archivo.buffer, { ignoreEncryption: true });
        const paginas = await unido.copyPages(origen, origen.getPageIndices());
        paginas.forEach((p) => unido.addPage(p));
      } else if (formato === "jpg" || formato === "png") {
        const imagen =
          formato === "jpg" ? await unido.embedJpg(archivo.buffer) : await unido.embedPng(archivo.buffer);
        const ancho = imagen.width * PUNTOS_POR_PIXEL;
        const alto = imagen.height * PUNTOS_POR_PIXEL;
        unido.addPage([ancho, alto]).drawImage(imagen, { x: 0, y: 0, width: ancho, height: alto });
      } else {
        throw new ArchivosInvalidosError(
          `"${archivo.fileName}" no es PDF, JPG ni PNG. Para subir varios archivos, usa esos formatos.`,
        );
      }
    } catch (err) {
      if (err instanceof ArchivosInvalidosError) throw err;
      throw new ArchivosInvalidosError(
        `No se pudo leer "${archivo.fileName}". Revisa que el archivo abra bien o súbelo como foto.`,
      );
    }
  }

  return {
    fileName: nombreUnido(archivos),
    mimeType: "application/pdf",
    buffer: Buffer.from(await unido.save()),
  };
}
