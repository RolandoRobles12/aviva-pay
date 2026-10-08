import { ImageAnnotatorClient } from "@google-cloud/vision";

let client: ImageAnnotatorClient | null = null;
function vision(): ImageAnnotatorClient {
  // Usa las credenciales del propio proyecto (la cuenta de servicio de
  // Cloud Functions): no hay secreto nuevo que configurar, solo habilitar
  // la API de Cloud Vision.
  client ??= new ImageAnnotatorClient();
  return client;
}

/** El PDF se lee de forma síncrona, que Vision limita a las primeras 5 páginas. */
const PAGINAS_PDF = [1, 2, 3, 4, 5];

/**
 * Saca el texto de un archivo subido. Imágenes y PDF van a Cloud Vision;
 * el XML (la factura CFDI) ya es texto y se lee tal cual, sin OCR.
 *
 * Lanza si Vision falla: quien llama decide qué hacer (no se bloquea una
 * subida porque el servicio de OCR esté caído).
 */
export async function extraerTexto(
  buffer: Buffer,
  mimeType: string | undefined,
  fileName: string,
): Promise<string> {
  const mime = (mimeType ?? "").toLowerCase();
  const nombre = fileName.toLowerCase();

  if (mime.includes("xml") || nombre.endsWith(".xml")) {
    return buffer.toString("utf8");
  }

  if (mime === "application/pdf" || nombre.endsWith(".pdf")) {
    const [res] = await vision().batchAnnotateFiles({
      requests: [
        {
          inputConfig: { content: buffer, mimeType: "application/pdf" },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          pages: PAGINAS_PDF,
        },
      ],
    });
    return (res.responses?.[0]?.responses ?? [])
      .map((r) => r.fullTextAnnotation?.text ?? "")
      .join("\n");
  }

  const [res] = await vision().documentTextDetection({ image: { content: buffer } });
  return res.fullTextAnnotation?.text ?? "";
}
