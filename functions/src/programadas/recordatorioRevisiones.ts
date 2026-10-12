import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { getDealsConRevisionPendiente } from "../firestore/dealsRepository";
import { getNotificacionesConfig } from "../firestore/notificacionesRepository";
import { getVerificacionesDeDeals, marcarRecordatorio } from "../firestore/verificacionesRepository";
import { notificar } from "../notificaciones/notificar";

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
 *
 * Solo se marca como recordado si el aviso llegó a algún destino: si Slack
 * falló, la siguiente hora se vuelve a intentar.
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
      const deals = await getDealsConRevisionPendiente(tipo);
      if (deals.length === 0) continue;
      const verificaciones = await getVerificacionesDeDeals(deals.map((d) => d.dealId));
      const pendientes = deals.map((d) => {
        const revision = tipo === "cotizacion" ? d.cotizacionRevision : d.comprobanteRevision;
        return {
          dealId: d.dealId,
          subidoEn: revision?.subidoEn ?? new Date(ahora).toISOString(),
          recordatorioEn: verificaciones.get(`${d.dealId}_${tipo}`)?.recordatorioEn,
        };
      });
      const tocan = atrasadas(pendientes, ahora, config.recordatorioHoras);

      for (const [i, p] of pendientes.entries()) {
        if (!tocan[i]) continue;
        const horas = Math.floor((ahora - Date.parse(p.subidoEn)) / 3_600_000);
        const { entregados } = await notificar({ evento: "revision_atrasada", dealId: p.dealId, tipo, horas });
        if (entregados > 0) {
          await marcarRecordatorio(p.dealId, tipo);
          logger.info(`recordatorioRevisiones: ${tipo} del deal ${p.dealId} (${horas} h)`);
        }
      }
    }
  },
);
