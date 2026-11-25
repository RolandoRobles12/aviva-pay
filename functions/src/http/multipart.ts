import Busboy from "busboy";
import type { Request } from "firebase-functions/v2/https";
import { ArchivosInvalidosError, MAX_ARCHIVOS } from "./unirArchivos";

export interface ArchivoSubido {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ParsedUpload {
  fields: Record<string, string>;
  /** En el orden en que llegaron; vacío si no vino ninguno. */
  files: ArchivoSubido[];
}

/**
 * Parses a multipart/form-data request into plain fields plus the uploaded
 * files, buffered in memory. A document can come in several files (the
 * two sides of a signed delivery note, for example): the upload handlers
 * join them into one with `unirArchivos`. Cloud Functions instances have
 * enough memory headroom for the PDF/image/XML sizes this project expects.
 */
export function parseMultipart(req: Request): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    // Uno más del máximo, para distinguir "justo el máximo" de "se pasó".
    const busboy = Busboy({ headers: req.headers, limits: { files: MAX_ARCHIVOS + 1 } });
    const fields: Record<string, string> = {};
    const files: ArchivoSubido[] = [];
    let demasiados = false;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, stream, info) => {
      // Cada archivo junta sus propios pedazos: compartirlos mezclaría los
      // bytes de un archivo con los del siguiente.
      const chunks: Buffer[] = [];
      const indice = files.length;
      files.push({ fileName: info.filename, mimeType: info.mimeType, buffer: Buffer.alloc(0) });
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        files[indice].buffer = Buffer.concat(chunks);
      });
    });

    busboy.on("filesLimit", () => {
      demasiados = true;
    });
    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (demasiados || files.length > MAX_ARCHIVOS) {
        reject(new ArchivosInvalidosError(`Sube máximo ${MAX_ARCHIVOS} archivos por documento.`));
        return;
      }
      resolve({ fields, files: files.filter((f) => f.buffer.length > 0) });
    });

    busboy.end(req.rawBody);
  });
}
