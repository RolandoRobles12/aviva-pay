import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { assertAdmin } from "../../auth/adminGuard";
import { eventosDesde } from "../../firestore/eventosDocumentoRepository";
import { calcularDocumentosPorTienda } from "../../metricas/calcular";

/**
 * Documentos por tienda de los últimos `dias` días (7 a 365), para la
 * pestaña "Por tienda" de Revisión de documentos. Cualquier admin.
 *
 * Conserva el nombre `adminMetricas` porque ya está desplegada; las
 * métricas del negocio son `adminMetricasNegocio`.
 */
export const adminMetricas = onCall<{ dias?: number }>(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    assertAdmin(request);
    const dias = Math.min(365, Math.max(7, Math.round(Number(request.data?.dias) || 90)));
    const desde = new Date(Date.now() - dias * 86_400_000);

    const [eventos, tiendasSnap] = await Promise.all([
      eventosDesde(desde),
      getFirestore().collection("paydesk_concesionarios").select("nombre").get(),
    ]);
    const nombres = new Map(tiendasSnap.docs.map((d) => [d.id, (d.data().nombre as string) ?? d.id]));

    return { dias, ...calcularDocumentosPorTienda(eventos, nombres) };
  },
);
