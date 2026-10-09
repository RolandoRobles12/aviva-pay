import { HttpsError, type CallableRequest, type Request } from "firebase-functions/v2/https";
import { getAppCheck } from "firebase-admin/app-check";

/**
 * Firebase App Check: comprueba que la llamada viene del sitio de Paydesk
 * y no de un script. Se exige solo con `APP_CHECK_ENFORCE=true` en
 * functions/.env, porque antes hay que registrar el sitio en App Check
 * (reCAPTCHA Enterprise) y desplegar el frontend con su llave
 * (`VITE_APP_CHECK_SITE_KEY`); prenderlo antes tumbaría a todas las tiendas.
 * Ver docs/ARCHITECTURE.md ("App Check").
 */
export function appCheckObligatorio(): boolean {
  return process.env.APP_CHECK_ENFORCE === "true";
}

const MENSAJE = "No pudimos verificar tu navegador. Recarga la página e intenta de nuevo.";

/** Para funciones `onCall`: el SDK ya validó el token si venía; aquí se exige que haya venido. */
export function exigirAppCheck(request: CallableRequest<unknown>): void {
  if (appCheckObligatorio() && !request.app) {
    throw new HttpsError("failed-precondition", MENSAJE);
  }
}

/** Para funciones `onRequest` (subidas multipart): el token llega en un encabezado. */
export class AppCheckError extends Error {
  constructor() {
    super(MENSAJE);
  }
}

export async function exigirAppCheckHttp(req: Request): Promise<void> {
  if (!appCheckObligatorio()) return;
  const token = req.header("X-Firebase-AppCheck");
  if (!token) throw new AppCheckError();
  try {
    await getAppCheck().verifyToken(token);
  } catch {
    throw new AppCheckError();
  }
}
