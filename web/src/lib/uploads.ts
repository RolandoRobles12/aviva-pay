import { auth } from "./firebase";

// The upload endpoints run as onRequest (they take multipart bodies, which
// callables can't), so unlike every other call they need an absolute URL.
//
// VITE_FUNCTIONS_BASE_URL exists to point at the local emulator. In
// production it's usually unset — and when it was, the old code built
// "undefined/uploadComprobante", a *relative* URL that Hosting happily
// answered with index.html, so the upload failed with a JSON parse error
// about "<!doctype" instead of anything actionable. Deriving the real
// URL from the project id removes that footgun: same region the functions
// declare (see functions/src/http/upload*.ts).
const REGION = "us-central1";
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;

const FUNCTIONS_BASE_URL =
  (import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined)?.replace(/\/+$/, "") ||
  `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

/**
 * Reads the response body once, as text, and only then tries to make JSON
 * of it. Parsing before checking `res.ok` is what hid the real failure:
 * any non-JSON error page (a 401 from the platform, Hosting's SPA
 * fallback) threw a parse error and buried the status code.
 */
async function leerRespuesta(res: Response): Promise<{
  datos: { ok?: true; url?: string; error?: string } | null;
  crudo: string;
}> {
  const crudo = await res.text();
  try {
    return { datos: JSON.parse(crudo), crudo };
  } catch {
    return { datos: null, crudo };
  }
}

async function postMultipart(path: string, formData: FormData) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  }

  const res = await fetch(`${FUNCTIONS_BASE_URL}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const { datos, crudo } = await leerRespuesta(res);

  if (!res.ok) {
    // Our own handlers always answer JSON, so a non-JSON body means the
    // request never reached them — it was rejected in front (the function
    // not being publicly invokable) or answered by something else. Say
    // which, instead of a parse error.
    if (!datos) {
      throw new Error(
        `El servidor respondió ${res.status} sin un mensaje legible. ` +
          `Revisa que ${FUNCTIONS_BASE_URL}/${path} exista y sea públicamente invocable.`,
      );
    }
    throw new Error(datos.error ?? "No se pudo completar la operación");
  }

  if (!datos) {
    throw new Error(
      `Respuesta inesperada del servidor (${res.status}): ${crudo.slice(0, 120)}`,
    );
  }

  return datos as { ok: true; url: string };
}

function cotizacionFormData(params: {
  dealId: string;
  file: File;
  fechaEntregaAcordada: string;
  montoTotalCompra: string;
}) {
  const formData = new FormData();
  formData.append("dealId", params.dealId);
  formData.append("file", params.file);
  formData.append("fechaEntregaAcordada", params.fechaEntregaAcordada);
  formData.append("montoTotalCompra", params.montoTotalCompra);
  return formData;
}

function comprobanteFormData(params: {
  dealId: string;
  file: File;
  fechaEntrega: string;
  firmaClienteConfirmada: boolean;
}) {
  const formData = new FormData();
  formData.append("dealId", params.dealId);
  formData.append("file", params.file);
  formData.append("fechaEntrega", params.fechaEntrega);
  formData.append(
    "firmaClienteConfirmada",
    params.firmaClienteConfirmada ? "true" : "false",
  );
  return formData;
}

export function uploadCotizacion(params: {
  dealId: string;
  file: File;
  fechaEntregaAcordada: string;
  montoTotalCompra: string;
}) {
  return postMultipart("uploadCotizacion", cotizacionFormData(params));
}

export function uploadComprobante(params: {
  dealId: string;
  file: File;
  fechaEntrega: string;
  firmaClienteConfirmada: boolean;
}) {
  return postMultipart("uploadComprobante", comprobanteFormData(params));
}

/**
 * Admin counterparts — same request shape, different endpoint (checked
 * against the `admin` claim instead of the store's own concesionarioIds
 * on the backend). Lets an admin replace a store's file on its behalf.
 */
export function adminUploadCotizacion(params: {
  dealId: string;
  file: File;
  fechaEntregaAcordada: string;
  montoTotalCompra: string;
}) {
  return postMultipart("adminUploadCotizacion", cotizacionFormData(params));
}

export function adminUploadComprobante(params: {
  dealId: string;
  file: File;
  fechaEntrega: string;
  firmaClienteConfirmada: boolean;
}) {
  return postMultipart("adminUploadComprobante", comprobanteFormData(params));
}
