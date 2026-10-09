import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertSuperAdmin } from "../../auth/adminGuard";
import { ETAPAS_BASE_DEFAULT } from "../../config/fields";
import {
  getEtapasDefaults,
  getEtapasFresh,
  setEtapas,
  type EtapaConfig,
} from "../../firestore/etapasRepository";

/** Devuelve las etapas en uso y las de código, para poder restaurarlas. */
export const adminGetEtapas = onCall({ region: "us-central1" }, async (request) => {
  assertSuperAdmin(request);
  return { etapas: await getEtapasFresh(), defaults: getEtapasDefaults() };
});

interface SetRequest {
  etapas?: EtapaConfig[];
}

const ID_RE = /^[a-z0-9_]{1,40}$/;
const PROPIEDAD_RE = /^[a-zA-Z0-9_]{1,100}$/;

/**
 * Guarda la lista ordenada de etapas. Se valida de más porque una etapa
 * personalizada con una propiedad mal escrita no truena, pero tampoco
 * llega nunca: mejor rechazar lo que claramente no es un nombre interno.
 */
export const adminSetEtapas = onCall<SetRequest>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const etapas = request.data?.etapas;

    if (!Array.isArray(etapas) || etapas.length === 0) {
      throw new HttpsError("invalid-argument", "Debe quedar al menos una etapa.");
    }
    if (etapas.length > 20) {
      throw new HttpsError("invalid-argument", "Máximo 20 etapas.");
    }

    const baseIds = new Set<string>(ETAPAS_BASE_DEFAULT.map((e) => e.id));
    const vistos = new Set<string>();
    const limpio: EtapaConfig[] = [];

    for (const e of etapas) {
      const id = typeof e?.id === "string" ? e.id : "";
      const label = typeof e?.label === "string" ? e.label.trim() : "";
      if (!ID_RE.test(id) || vistos.has(id)) {
        throw new HttpsError("invalid-argument", `Id de etapa inválido o repetido: "${id}".`);
      }
      vistos.add(id);
      if (!label) {
        throw new HttpsError("invalid-argument", "Toda etapa necesita un nombre.");
      }

      if (e.tipo === "base") {
        if (!baseIds.has(id)) {
          throw new HttpsError("invalid-argument", `Etapa base desconocida: "${id}".`);
        }
        limpio.push({ id, label, tipo: "base" });
      } else if (e.tipo === "personalizada") {
        const propiedad = typeof e.propiedad === "string" ? e.propiedad.trim() : "";
        if (!PROPIEDAD_RE.test(propiedad)) {
          throw new HttpsError(
            "invalid-argument",
            `La etapa "${label}" necesita el nombre interno de una propiedad de HubSpot.`,
          );
        }
        limpio.push({ id, label, tipo: "personalizada", propiedad });
      } else {
        throw new HttpsError("invalid-argument", `Tipo de etapa inválido en "${label}".`);
      }
    }

    await setEtapas(limpio, admin.email ?? admin.uid);
    logger.info(`adminSetEtapas: updated by ${admin.email ?? admin.uid}`);
    return { ok: true };
  },
);
