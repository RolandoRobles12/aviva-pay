import { getStorage } from "firebase-admin/storage";

/**
 * Guarda una cotización/comprobante en Cloud Storage. Es la copia que
 * Paydesk sirve ("Ver archivo"); otra copia va a HubSpot Files (ver
 * hubspot/files.ts) para que el equipo de Aviva la vea sin salir del CRM.
 *
 * Solo se guarda la ruta. Antes se guardaba una URL firmada con
 * vencimiento en el año 2500, que funcionaba como una llave permanente:
 * quien la tuviera (un correo reenviado, una captura) abría el documento
 * para siempre, sin sesión. Ahora la liga se genera al momento de abrir el
 * archivo, para alguien con permiso, y caduca en minutos — ver
 * `urlTemporal` y http/getArchivoUrl.ts.
 *
 * `storage.rules` niega toda lectura/escritura desde el cliente en esta
 * ruta: solo las funciones (Admin SDK) la tocan.
 */
export async function storeDealFile(
  dealId: string,
  category: "cotizacion" | "comprobante",
  fileName: string,
  fileBuffer: Buffer,
  contentType?: string,
): Promise<{ path: string }> {
  const path = `paydesk_deals/${dealId}/${category}/${Date.now()}-${fileName}`;
  await getStorage().bucket().file(path).save(fileBuffer, { contentType, resumable: false });
  return { path };
}

export const MINUTOS_LIGA = 15;

/** Liga de lectura que caduca en `MINUTOS_LIGA` minutos. */
export async function urlTemporal(path: string): Promise<string> {
  const [url] = await getStorage()
    .bucket()
    .file(path)
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + MINUTOS_LIGA * 60_000 });
  return url;
}

export async function descargar(path: string): Promise<Buffer> {
  const [buffer] = await getStorage().bucket().file(path).download();
  return buffer;
}

/**
 * La ruta dentro del bucket a partir de una de las URLs firmadas viejas
 * (`https://storage.googleapis.com/<bucket>/<ruta>?...`). Sirve para
 * migrar los deals que todavía guardan la liga permanente. `null` si la URL
 * no es de Storage (por ejemplo, la de HubSpot Files).
 */
export function rutaDesdeUrlFirmada(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "storage.googleapis.com") return null;
    const partes = u.pathname.split("/").filter(Boolean);
    if (partes.length < 2) return null;
    const ruta = decodeURIComponent(partes.slice(1).join("/"));
    return ruta.startsWith("paydesk_deals/") ? ruta : null;
  } catch {
    return null;
  }
}
