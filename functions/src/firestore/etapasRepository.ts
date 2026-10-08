import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { ETAPAS_BASE_DEFAULT } from "../config/fields";
import { TTL_CONFIG_MS } from "./configCache";

const COLLECTION = "paydesk_config";
const DOC_ID = "etapas";

/**
 * Una etapa del avance de un crédito. Las `base` se calculan con campos que
 * Paydesk ya conoce; las `personalizada` se marcan como alcanzadas cuando
 * `propiedad` (una propiedad de fecha de HubSpot, normalmente
 * `hs_v2_date_entered_<etapa>`) tiene valor.
 */
export interface EtapaConfig {
  id: string;
  label: string;
  tipo: "base" | "personalizada";
  propiedad?: string;
}

let cached: EtapaConfig[] | null = null;
let cacheExpira = 0;

function etapasDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export function getEtapasDefaults(): EtapaConfig[] {
  return ETAPAS_BASE_DEFAULT.map((e) => ({ ...e, tipo: "base" as const }));
}

function sanitize(stored: unknown): EtapaConfig[] | null {
  if (!Array.isArray(stored)) return null;
  const baseIds = new Set<string>(ETAPAS_BASE_DEFAULT.map((e) => e.id));
  const out: EtapaConfig[] = [];
  for (const raw of stored) {
    if (!raw || typeof raw !== "object") continue;
    const { id, label, tipo, propiedad } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof label !== "string" || !label.trim()) continue;
    if (tipo === "base" && baseIds.has(id)) {
      out.push({ id, label: label.trim(), tipo: "base" });
    } else if (
      tipo === "personalizada" &&
      typeof propiedad === "string" &&
      propiedad.trim()
    ) {
      out.push({ id, label: label.trim(), tipo: "personalizada", propiedad: propiedad.trim() });
    }
  }
  return out.length > 0 ? out : null;
}

export async function getEtapas(): Promise<EtapaConfig[]> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getEtapasFresh();
}

/** Lee siempre de Firestore, sin caché — es lo que usa el panel. */
export async function getEtapasFresh(): Promise<EtapaConfig[]> {
  const snap = await etapasDoc().get();
  const resolved = sanitize(snap.exists ? snap.data()?.etapas : null) ?? getEtapasDefaults();
  cached = resolved;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return resolved;
}

export async function setEtapas(
  etapas: EtapaConfig[],
  actualizadoPor: string,
): Promise<void> {
  await etapasDoc().set({
    etapas,
    actualizadoPor,
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  cached = null;
}
