import { auth } from "./firebase";

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL as string;

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
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "No se pudo completar la operación");
  }
  return body as { ok: true; url: string };
}

export function uploadCotizacion(params: {
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
  return postMultipart("uploadCotizacion", formData);
}

export function uploadComprobante(params: {
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
  return postMultipart("uploadComprobante", formData);
}
