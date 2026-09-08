import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HUBSPOT_EXCLUDED_STAGES } from "../config/fields";
import { TTL_CONFIG_MS } from "./configCache";

const COLLECTION = "paydesk_config";
const DOC_ID = "cancel_stages";

/**
 * Los ids de etapa de HubSpot que significan "este crédito ya no existe".
 *
 * Editable sin desplegar, mismo patrón que el diccionario de campos,
 * porque es una lista que el negocio puede cambiar —abrir una etapa
 * nueva, decidir que Precancelación ya no cuenta— y que tiene
 * consecuencias inmediatas: en cuanto un deal entra a una de estas
 * etapas, su vale se cancela y deja de servir en cualquier caja.
 */
let cached: string[] | null = null;
let cacheExpira = 0;

function stagesDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export async function getCancelStages(): Promise<string[]> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getCancelStagesFresh();
}

/** Lee siempre de Firestore, sin caché — es lo que usa el panel. */
export async function getCancelStagesFresh(): Promise<string[]> {
  const snap = await stagesDoc().get();
  const stored = snap.exists ? snap.data()?.etapas : null;

  const resolved = Array.isArray(stored)
    ? stored.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [...HUBSPOT_EXCLUDED_STAGES];

  cached = resolved;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return resolved;
}

export async function setCancelStages(
  etapas: string[],
  actualizadoPor: string,
): Promise<void> {
  await stagesDoc().set(
    {
      etapas,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  cached = null;
}

export function getCancelStagesDefaults(): string[] {
  return [...HUBSPOT_EXCLUDED_STAGES];
}
