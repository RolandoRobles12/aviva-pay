import { onCall } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { dealsCollection } from "../../firestore/dealsRepository";
import { eventosDesde } from "../../firestore/eventosDocumentoRepository";
import { getFirestore } from "firebase-admin/firestore";
import { calcularMetricas } from "../../metricas/calcular";
import type { PayDeskDeal } from "../../types/deal";

/** Métricas por tienda de los últimos `dias` días (7 a 365). Para cualquier admin. */
export const adminMetricas = onCall<{ dias?: number }>(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    assertAdmin(request);
    const dias = Math.min(365, Math.max(7, Math.round(Number(request.data?.dias) || 90)));
    const desde = new Date(Date.now() - dias * 86_400_000);

    const [dealsSnap, eventos, tiendasSnap] = await Promise.all([
      dealsCollection()
        .select("concesionarioId", "cancelado", "fechaSolicitud", "desembolsoFecha")
        .get(),
      eventosDesde(desde),
      getFirestore().collection("paydesk_concesionarios").select("nombre").get(),
    ]);
    const nombres = new Map(tiendasSnap.docs.map((d) => [d.id, (d.data().nombre as string) ?? d.id]));
    const deals = dealsSnap.docs.map((d) => d.data() as Pick<
      PayDeskDeal,
      "concesionarioId" | "cancelado" | "fechaSolicitud" | "desembolsoFecha"
    >);

    return { dias, ...calcularMetricas(deals, eventos, nombres, desde) };
  },
);
