import Busboy from "busboy";
import type { Request } from "firebase-functions/v2/https";

export interface ParsedUpload {
  fields: Record<string, string>;
  file: { fileName: string; mimeType: string; buffer: Buffer } | null;
}

/**
 * Parses a multipart/form-data request into plain fields plus a single
 * uploaded file, buffered in memory. Cloud Functions instances have enough
 * memory headroom for the PDF/image/XML sizes this project expects
 * (cotizaciones, comprobantes de entrega); revisit if larger files show up.
 */
export function parseMultipart(req: Request): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields: Record<string, string> = {};
    let file: ParsedUpload["file"] = null;
    const chunks: Buffer[] = [];

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, stream, info) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        file = {
          fileName: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        };
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, file }));

    busboy.end(req.rawBody);
  });
}
