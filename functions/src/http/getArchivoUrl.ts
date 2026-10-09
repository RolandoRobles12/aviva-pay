import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDeal } from "../firestore/dealsRepository";
import { rutaDesdeUrlFirmada, urlTemporal, MINUTOS_LIGA } from "../storage/dealFiles";
import { exigirAppCheck } from "../auth/appCheck";
import { limitar } from "../auth/rateLimit";

interface Request {
  dealId?: string;
  tipo?: "cotizacion" | "comprobante";
  /** El documento en revisión en vez del vigente (solo admins). */
  revision?: boolean;
}

/**
 * Liga temporal para abrir una cotización o comprobante. Reemplaza a las
 * URLs firmadas permanentes que se guardaban en el deal: ahora la liga se
 * genera al momento, solo para quien tiene permiso (la tienda dueña del
 * deal o un administrador), y caduca en `MINUTOS_LIGA` minutos.
 */
export const getArchivoUrl = onCall<Request>({ region: "us-central1" }, async (request) => {
  exigirAppCheck(request);
  const token = request.auth?.token;
  if (!token) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  await limitar("archivo", request.auth!.uid, { max: 120, ventanaSeg: 600 });

  const { dealId, tipo, revision } = request.data ?? {};
  if (!dealId || (tipo !== "cotizacion" && tipo !== "comprobante")) {
    throw new HttpsError("invalid-argument", "dealId y tipo son requeridos.");
  }

  const esAdmin = token.admin === true;
  const deal = await getDeal(dealId);
  const tiendas = (token.concesionarioIds as string[] | undefined) ?? [];
  // Misma respuesta si no existe o si es de otra tienda: no se puede
  // sondear qué deals existen.
  if (!deal || (!esAdmin && !(deal.concesionarioId && tiendas.includes(deal.concesionarioId)))) {
    throw new HttpsError("not-found", "Archivo no encontrado.");
  }

  let path: string | null | undefined;
  let urlExterna: string | null = null;
  if (revision) {
    if (!esAdmin) throw new HttpsError("not-found", "Archivo no encontrado.");
    path = (tipo === "cotizacion" ? deal.cotizacionRevision : deal.comprobanteRevision)?.storagePath;
  } else {
    path = tipo === "cotizacion" ? deal.cotizacionPath : deal.comprobantePath;
    if (!path) {
      // Deals de antes de la migración: la ruta va dentro de la URL vieja.
      const url = tipo === "cotizacion" ? deal.cotizacionUrl : deal.comprobanteUrl;
      if (url) {
        path = rutaDesdeUrlFirmada(url);
        // Una URL que no es de Storage (la de HubSpot Files, en deals
        // históricos) se devuelve tal cual: pide su propio inicio de sesión.
        if (!path) urlExterna = url;
      }
    }
  }

  if (urlExterna) return { url: urlExterna, minutos: null };
  if (!path) throw new HttpsError("not-found", "Este documento no tiene archivo.");
  return { url: await urlTemporal(path), minutos: MINUTOS_LIGA };
});
