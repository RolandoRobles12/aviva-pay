import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { assertAdmin, assertSuperAdmin } from "../../auth/adminGuard";
import {
  esOrigenDisposicion,
  getOrigenDisposicionFresh,
  setOrigenDisposicion,
  type OrigenDisposicion,
} from "../../firestore/disposicionConfigRepository";
import { dealsCollection } from "../../firestore/dealsRepository";
import { valesCollection } from "../../firestore/valesRepository";
import { fechaHubspotGuardada, resolverFechaDisposicion } from "../../vale/disposicion";
import type { PayDeskDeal } from "../../types/deal";
import type { PayDeskVale } from "../../types/vale";

/**
 * Vuelve a calcular la fecha de disposición de todos los deals con el
 * origen dado. Se corre al guardar el origen en el panel, para que el
 * cambio se vea de inmediato en todas las tablas y no hasta la próxima
 * sincronización de cada deal.
 *
 * De paso rellena la fecha de Paydesk de los vales que se confirmaron
 * antes de que el deal la guardara, leyéndola del propio vale.
 *
 * Idempotente: un deal que ya está bien no se escribe.
 */
async function recalcularFechasDisposicion(
  origen: OrigenDisposicion,
): Promise<{ revisados: number; actualizados: number }> {
  const db = getFirestore();

  // Un solo query por estado (índice de un solo campo, automático).
  const usados = await valesCollection().where("estado", "==", "utilizado").get();
  const confirmadoEn = new Map<string, string>();
  for (const doc of usados.docs) {
    const vale = doc.data() as PayDeskVale;
    if (!vale.consumidoEn) continue;
    const iso = vale.consumidoEn.toDate().toISOString();
    const previo = confirmadoEn.get(vale.dealId);
    if (!previo || iso > previo) confirmadoEn.set(vale.dealId, iso);
  }

  const snap = await dealsCollection().get();
  let actualizados = 0;
  let batch = db.batch();
  let operaciones = 0;

  for (const doc of snap.docs) {
    const deal = doc.data() as PayDeskDeal;
    const hubspot = fechaHubspotGuardada(deal);
    const paydesk = deal.disposicionPaydeskFecha ?? confirmadoEn.get(deal.dealId) ?? null;
    const resuelta = resolverFechaDisposicion(origen, { paydesk, hubspot });

    if (
      deal.disposicionHubspotFecha === hubspot &&
      (deal.disposicionPaydeskFecha ?? null) === paydesk &&
      (deal.disposicionCreditoFecha ?? null) === resuelta
    ) {
      continue;
    }

    batch.update(doc.ref, {
      disposicionHubspotFecha: hubspot,
      disposicionPaydeskFecha: paydesk,
      disposicionCreditoFecha: resuelta,
    });
    actualizados++;
    if (++operaciones >= 400) {
      await batch.commit();
      batch = db.batch();
      operaciones = 0;
    }
  }
  if (operaciones > 0) await batch.commit();

  return { revisados: snap.size, actualizados };
}

export const adminGetDisposicion = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return { origen: await getOrigenDisposicionFresh() };
});

/**
 * Guarda de dónde sale la fecha de disposición y la recalcula en todos
 * los deals. Recalcular va siempre, aunque el origen no cambie: así el
 * mismo botón sirve para dejar al día los deals de antes de este ajuste.
 */
export const adminSetDisposicion = onCall<{ origen?: string }>(
  { region: "us-central1", timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const origen = request.data?.origen;
    if (!esOrigenDisposicion(origen)) {
      throw new HttpsError("invalid-argument", "Origen inválido: usa \"paydesk\" o \"hubspot\".");
    }

    await setOrigenDisposicion(origen, admin.email ?? admin.uid);
    const { revisados, actualizados } = await recalcularFechasDisposicion(origen);
    logger.info(
      `adminSetDisposicion: origen = ${origen} por ${admin.email ?? admin.uid}; ` +
        `${actualizados} de ${revisados} deals recalculados`,
    );
    return { ok: true as const, revisados, actualizados };
  },
);
