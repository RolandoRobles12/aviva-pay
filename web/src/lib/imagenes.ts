/**
 * Prepara una foto antes de subirla, para que la verificación automática
 * la pueda leer:
 * - HEIC/HEIF (las fotos de iPhone) se convierten a JPEG. Claude no las
 *   acepta, y sin esto todas caían en revisión manual.
 * - Las fotos muy grandes se reducen (lado mayor de 2400 px, JPEG). Claude
 *   no acepta imágenes de más de 5 MB, y una foto de celular moderna
 *   fácilmente las pasa; 2400 px sobra para leer una cotización.
 *
 * PDF y XML pasan intactos.
 */
export const LADO_MAXIMO = 2400;
/**
 * 3.5 MB crudos: la API acepta imágenes de hasta 5 MB y, por si ese límite
 * se mide sobre la versión en base64 (que crece ~4/3), así se queda debajo
 * en cualquier caso. El backend aplica el mismo tope (ocr/analizar.ts).
 */
export const BYTES_MAXIMO = 3.5 * 1024 * 1024;

export function esHeic(file: { name: string; type: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function esImagenReducible(file: { type: string }): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

/** Tamaño final conservando proporción, sin agrandar nunca. */
export function dimensionesObjetivo(
  ancho: number,
  alto: number,
  max = LADO_MAXIMO,
): { ancho: number; alto: number } {
  const escala = Math.min(1, max / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

export function nombreJpg(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, "") + ".jpg";
}

async function aJpeg(blob: Blob, nombre: string): Promise<File> {
  const bitmap = await createImageBitmap(blob);
  let ultima: Blob | null = null;
  try {
    // Si a la calidad más baja todavía pesa demasiado, se reduce el tamaño
    // y se intenta de nuevo; así nunca sale un archivo que la verificación
    // no pueda leer.
    for (const lado of [LADO_MAXIMO, 1800, 1400]) {
      const { ancho, alto } = dimensionesObjetivo(bitmap.width, bitmap.height, lado);
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo procesar la imagen.");
      ctx.fillStyle = "#fff"; // un PNG transparente no debe quedar negro
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(bitmap, 0, 0, ancho, alto);
      for (const calidad of [0.85, 0.75, 0.6]) {
        ultima = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", calidad));
        if (ultima && ultima.size <= BYTES_MAXIMO) {
          return new File([ultima], nombreJpg(nombre), { type: "image/jpeg" });
        }
      }
    }
  } finally {
    bitmap.close();
  }
  if (!ultima) throw new Error("No se pudo procesar la imagen.");
  return new File([ultima], nombreJpg(nombre), { type: "image/jpeg" });
}

export async function prepararArchivo(file: File): Promise<File> {
  if (esHeic(file)) {
    // Se carga solo cuando hace falta: la librería pesa ~1 MB.
    const { default: heic2any } = await import("heic2any");
    const convertido = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(convertido) ? convertido[0] : convertido;
    return aJpeg(blob, file.name);
  }
  if (esImagenReducible(file)) {
    if (file.size <= BYTES_MAXIMO) {
      const bitmap = await createImageBitmap(file);
      const grande = Math.max(bitmap.width, bitmap.height) > LADO_MAXIMO;
      bitmap.close();
      if (!grande) return file;
    }
    return aJpeg(file, file.name);
  }
  return file;
}
