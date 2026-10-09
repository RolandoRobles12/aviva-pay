import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { fetchDealById, searchConstruramaDeals } from "../hubspot/deals";
import { procesarDeal } from "../sync/procesarDeal";
import { alertar } from "../notificaciones/alertas";
import { getSyncEstado, setSyncEstado } from "../firestore/syncEstadoRepository";
import type { DealSincronizado } from "../types/deal";

/** Traslape con la corrida anterior, para no perder deals modificados justo en el borde. */
const TRASLAPE_MS = 10 * 60_000;
/** Primera corrida (o tras mucho tiempo sin éxito): no más atrás que esto. */
const MAX_ATRAS_MS = 3 * 24 * 60 * 60_000;
const CONCURRENCY = 10;
/** Un deal que falla tantas veces seguidas se deja de reintentar (y se avisa). */
export const MAX_REINTENTOS = 5;

/**
 * Desde cuándo buscar. Si la última corrida exitosa es más vieja que el
 * máximo, se recorta y se reporta el hueco: lo que cambió antes no lo
 * recoge esta corrida y hay que correr "Sincronizar ahora".
 */
export function ventanaDesde(
  ultimaExito: string | null,
  ahora: number,
): { desde: Date; hueco: boolean } {
  const ultima = ultimaExito ? Date.parse(ultimaExito) : null;
  const ideal = ultima === null ? ahora - MAX_ATRAS_MS : ultima - TRASLAPE_MS;
  const limite = ahora - MAX_ATRAS_MS;
  return { desde: new Date(Math.max(ideal, limite)), hueco: ultima !== null && ideal < limite };
}

/**
 * Siguiente lista de reintentos: los que fallaron suman un intento, los
 * que salieron bien se quitan, y los que llegan a `MAX_REINTENTOS` se
 * abandonan (se regresan aparte para avisar).
 */
export function siguientesReintentos(
  previos: Record<string, number>,
  fallidos: string[],
  exitosos: string[],
): { reintentos: Record<string, number>; abandonados: string[] } {
  const reintentos: Record<string, number> = { ...previos };
  for (const id of exitosos) delete reintentos[id];
  const abandonados: string[] = [];
  for (const id of fallidos) {
    const n = (previos[id] ?? 0) + 1;
    if (n >= MAX_REINTENTOS) {
      delete reintentos[id];
      abandonados.push(id);
    } else {
      reintentos[id] = n;
    }
  }
  return { reintentos, abandonados };
}

/**
 * Red de seguridad del webhook de HubSpot. Cada 30 minutos trae los deals
 * de Construrama modificados desde la última corrida y los procesa
 * exactamente igual que el webhook (sync/procesarDeal.ts): si un aviso del
 * workflow se perdió, el deal se pone al día aquí — incluida la
 * cancelación de su vale.
 *
 * La marca de tiempo siempre avanza; los deals que fallan se guardan en
 * `reintentos` y se vuelven a pedir uno por uno en las siguientes corridas
 * (hasta `MAX_REINTENTOS`). Así un solo deal con datos malos no obliga a
 * reprocesar días enteros cada media hora.
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
    const { desde, hueco } = ventanaDesde(estado.ultimaExito, inicio.getTime());
    await setSyncEstado({ ultimoIntento: inicio.toISOString() });

    if (hueco) {
      await alertar(
        "sync_hueco",
        "La sincronización periódica estuvo detenida más de 3 días",
        `Los deals modificados antes de ${desde.toISOString()} no se recogieron. Corre "Sincronizar ahora" en /admin/tiendas.`,
        24 * 60,
      );
    }

    try {
      const encontrados = await searchConstruramaDeals({ modificadosDesde: desde });
      const porId = new Map<string, DealSincronizado>();
      for (const { deal } of encontrados) porId.set(deal.dealId, deal);
      // Los que fallaron antes y no volvieron a cambiar se piden aparte.
      for (const id of Object.keys(estado.reintentos)) {
        if (porId.has(id)) continue;
        try {
          const r = await fetchDealById(id);
          if (r) porId.set(id, r.deal);
        } catch (err) {
          logger.error(`sincronizacionPeriodica: no se pudo traer el deal ${id}`, err);
        }
      }

      const deals = [...porId.values()].filter((d) => d.concesionarioId);
      const exitosos: string[] = [];
      const fallidos: string[] = [];
      for (let i = 0; i < deals.length; i += CONCURRENCY) {
        const lote = deals.slice(i, i + CONCURRENCY);
        const r = await Promise.allSettled(lote.map((d) => procesarDeal(d, "sincronizacion-periodica")));
        r.forEach((x, j) => {
          if (x.status === "fulfilled") exitosos.push(lote[j].dealId);
          else {
            fallidos.push(lote[j].dealId);
            logger.error(`sincronizacionPeriodica: falló el deal ${lote[j].dealId}`, x.reason);
          }
        });
      }
      // Un reintento que ya no se pudo ni traer de HubSpot cuenta como fallido.
      for (const id of Object.keys(estado.reintentos)) {
        if (!porId.has(id) && !fallidos.includes(id)) fallidos.push(id);
      }

      const { reintentos, abandonados } = siguientesReintentos(estado.reintentos, fallidos, exitosos);
      const resumen =
        `${encontrados.length} modificados desde ${desde.toISOString()}, ` +
        `${exitosos.length} procesados, ${fallidos.length} con error`;
      logger.info(`sincronizacionPeriodica: ${resumen}`);
      await setSyncEstado({
        ultimaExito: inicio.toISOString(),
        ultimoResultado: resumen,
        ultimoError: null,
        reintentos,
      });
      if (abandonados.length > 0) {
        await alertar(
          "sync_abandonados",
          `${abandonados.length} deals no se pudieron sincronizar tras ${MAX_REINTENTOS} intentos`,
          `Deals: ${abandonados.join(", ")}. Revísalos en HubSpot y en los logs de sincronizacionPeriodica.`,
        );
      }
    } catch (err) {
      // Falló la búsqueda misma (HubSpot caído): la marca no avanza y la
      // siguiente corrida cubre esta ventana.
      logger.error("sincronizacionPeriodica: falló", err);
      await setSyncEstado({ ultimoError: err instanceof Error ? err.message : String(err) });
      await alertar("sync", "Falló la sincronización periódica con HubSpot", err);
    }
  },
);
