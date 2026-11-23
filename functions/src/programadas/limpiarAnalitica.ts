import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { getUsoConfigFresh, limpiarVencidos } from "../firestore/usoRepository";

/**
 * Cada madrugada borra los eventos de uso y las grabaciones que ya pasaron
 * del plazo (365 días por defecto para ambos; se cambia en "Uso del
 * portal" → Grabaciones). Así lo que se guarda de cómo trabaja cada
 * persona no se queda para siempre.
 */
export const limpiarAnalitica = onSchedule(
  {
    schedule: "every day 03:30",
    timeZone: "America/Mexico_City",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const config = await getUsoConfigFresh();
    const borrados = await limpiarVencidos(config);
    logger.info("limpiarAnalitica", borrados);
  },
);
