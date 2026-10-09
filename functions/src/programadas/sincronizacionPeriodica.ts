import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { searchConstruramaDeals } from "../hubspot/deals";
import { procesarDeal } from "../sync/procesarDeal";
import { alertar } from "../notificaciones/alertas";
import { getSyncEstado, setSyncEstado } from "../firestore/syncEstadoRepository";

/** Traslape con la corrida anterior, para no perder deals modificados justo en el borde. */
const TRASLAPE_MS = 10 * 60_000;
/** Primera corrida (o tras mucho tiempo sin éxito): no más atrás que esto. */
const MAX_ATRAS_MS = 3 * 24 * 60 * 60_000;
const CONCURRENCY = 10;

/**
 * Red de seguridad del webhook de HubSpot. Cada 30 minutos trae los deals
 * de Construrama modificados desde la última corrida exitosa y los
 * procesa exactamente igual que el webhook (sync/procesarDeal.ts): si un
 * aviso del workflow se perdió, el deal se pone al día aquí — incluida la
 * cancelación de su vale.
 *
 * Como solo trae lo que cambió, no tiene el problema de la sincronización
 * completa (que recorre todo y puede no caber en 9 minutos).
 */
export const sincronizacionPeriodica = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "America/Mexico_City",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: ["HUBSPOT_PRIVATE_APP_TOKEN", "SLACK_BOT_TOKEN"],
  },
  async () => {
    const inicio = new Date();
    const estado = await getSyncEstado();
    const ultima = estado.ultimaExito ? Date.parse(estado.ultimaExito) : 0;
    const desde = new Date(Math.max(ultima - TRASLAPE_MS, inicio.getTime() - MAX_ATRAS_MS));
    await setSyncEstado({ ultimoIntento: inicio.toISOString() });

    try {
      const encontrados = await searchConstruramaDeals({ modificadosDesde: desde });
      let procesados = 0;
      let fallidos = 0;
      for (let i = 0; i < encontrados.length; i += CONCURRENCY) {
        const lote = encontrados.slice(i, i + CONCURRENCY);
        const r = await Promise.allSettled(
          lote
            .filter(({ deal }) => deal.concesionarioId)
            .map(({ deal }) => procesarDeal(deal, "sincronizacion-periodica")),
        );
        for (const x of r) {
          if (x.status === "fulfilled") procesados++;
          else {
            fallidos++;
            logger.error("sincronizacionPeriodica: falló un deal", x.reason);
          }
        }
      }

      const resumen = `${encontrados.length} modificados desde ${desde.toISOString()}, ${procesados} procesados, ${fallidos} con error`;
      logger.info(`sincronizacionPeriodica: ${resumen}`);
      // Con deals fallidos no se avanza la marca: la siguiente corrida los
      // vuelve a intentar.
      await setSyncEstado({
        ...(fallidos === 0 ? { ultimaExito: inicio.toISOString() } : {}),
        ultimoResultado: resumen,
        ultimoError: null,
      });
      if (fallidos > 0) {
        await alertar("sync", `La sincronización periódica no pudo procesar ${fallidos} deals`, resumen);
      }
    } catch (err) {
      logger.error("sincronizacionPeriodica: falló", err);
      await setSyncEstado({ ultimoError: err instanceof Error ? err.message : String(err) });
      await alertar("sync", "Falló la sincronización periódica con HubSpot", err);
    }
  },
);
