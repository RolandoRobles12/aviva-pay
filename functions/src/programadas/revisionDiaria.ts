import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFieldDictionary } from "../firestore/fieldDictionaryRepository";
import { alertar } from "../notificaciones/alertas";

/** Campos del diccionario que siguen con un nombre provisional `TODO_*`. */
export function camposSinMapear(diccionario: Record<string, string>): string[] {
  return Object.entries(diccionario)
    .filter(([, propiedad]) => !propiedad || propiedad.startsWith("TODO_"))
    .map(([campo]) => campo);
}

/**
 * Cada mañana: si el diccionario de campos todavía tiene propiedades sin
 * definir, avisa a Slack. Un campo sin mapear no truena nada — solo nunca
 * tiene valor —, así que sin este aviso puede pasar meses sin que nadie
 * lo note.
 */
export const revisionDiaria = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "America/Mexico_City",
    region: "us-central1",
    secrets: ["SLACK_BOT_TOKEN"],
  },
  async () => {
    const faltan = camposSinMapear(await getFieldDictionary());
    if (faltan.length === 0) return;
    await alertar(
      "campos_sin_mapear",
      `${faltan.length} campos del diccionario siguen sin propiedad de HubSpot`,
      `Sin mapear: ${faltan.join(", ")}. Captúralos en /admin/diccionario.`,
      23 * 60,
    );
  },
);
