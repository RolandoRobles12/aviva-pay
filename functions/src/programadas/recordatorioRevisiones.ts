import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { dealsCollection } from "../firestore/dealsRepository";
import { getNotificacionesConfig } from "../firestore/notificacionesRepository";
import { getVerificacion, marcarRecordatorio } from "../firestore/verificacionesRepository";
import { notificar } from "../notificaciones/notificar";
import type { PayDeskDeal } from "../types/deal";

/** Revisiones que ya pasaron el umbral y no se han recordado; pura, para probarla. */
export function atrasadas(
  pendientes: Array<{ subidoEn: string; recordatorioEn: string | null | undefined }>,
  ahora: number,
  horas: number,
): boolean[] {
  return pendientes.map(
    (p) => horas > 0 && !p.recordatorioEn && ahora - Date.parse(p.subidoEn) >= horas * 3_600_000,
  );
}

/**
 * Cada hora: los documentos que llevan más de `recordatorioHoras` en
 * revisión sin que nadie los atienda se avisan a Slack (`revision_atrasada`),
 * una sola vez por subida. Sin esto la tienda puede esperar
 * indefinidamente con su documento "En revisión".
 */
export const recordatorioRevisiones = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "America/Mexico_City",
    region: "us-central1",
    secrets: ["SLACK_BOT_TOKEN"],
  },
  async () => {
    const config = await getNotificacionesConfig();
    if (!config.activo || config.recordatorioHoras <= 0) return;

    const ahora = Date.now();
    for (const tipo of ["cotizacion", "comprobante"] as const) {
      const snap = await dealsCollection().where(`${tipo}Revision.estado`, "==", "pendiente").get();
      for (const doc of snap.docs) {
        const deal = doc.data() as PayDeskDeal;
        const revision = tipo === "cotizacion" ? deal.cotizacionRevision : deal.comprobanteRevision;
        if (!revision) continue;
        const v = await getVerificacion(deal.dealId, tipo);
        const [toca] = atrasadas(
          [{ subidoEn: revision.subidoEn, recordatorioEn: v?.recordatorioEn }],
          ahora,
          config.recordatorioHoras,
        );
        if (!toca) continue;
        const horas = Math.floor((ahora - Date.parse(revision.subidoEn)) / 3_600_000);
        await notificar({ evento: "revision_atrasada", dealId: deal.dealId, tipo, horas });
        await marcarRecordatorio(deal.dealId, tipo);
        logger.info(`recordatorioRevisiones: ${tipo} del deal ${deal.dealId} (${horas} h)`);
      }
    }
  },
);
