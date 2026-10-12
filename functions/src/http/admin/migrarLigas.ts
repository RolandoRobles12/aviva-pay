import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { assertSuperAdmin } from "../../auth/adminGuard";
import { dealsCollection } from "../../firestore/dealsRepository";
import { getVerificacionesDeDeals } from "../../firestore/verificacionesRepository";
import { rutaDesdeUrlFirmada } from "../../storage/dealFiles";
import type { PayDeskDeal } from "../../types/deal";
import type { ResultadoOcr } from "../../ocr/validarDocumento";

type DealViejo = PayDeskDeal & { cotizacionOcr?: ResultadoOcr; comprobanteOcr?: ResultadoOcr };

/**
 * Migración de una sola vez, para dejar el deal sin nada que la tienda no
 * deba ver:
 * - quita la URL firmada permanente de su cotización/comprobante y guarda
 *   solo la ruta;
 * - mueve el resultado de la verificación (`cotizacionOcr` /
 *   `comprobanteOcr`, que una versión anterior guardaba en el deal) a su
 *   colección privada — salvo que ya haya ahí uno más nuevo, que gana.
 *
 * Ojo: las ligas que ya se compartieron no se invalidan con esto — siguen
 * firmadas. Ver docs/ARCHITECTURE.md ("Documentos").
 *
 * Idempotente: un deal ya migrado no tiene nada que mover y se salta.
 */
export const adminMigrarLigasArchivos = onCall(
  { region: "us-central1", timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const db = getFirestore();
    const snap = await dealsCollection().get();
    const deals = snap.docs.map((d) => ({ ref: d.ref, data: d.data() as DealViejo }));

    // Solo se consultan las verificaciones privadas de los deals que traen
    // una vieja, en lotes.
    const conOcr = deals.filter((d) => d.data.cotizacionOcr || d.data.comprobanteOcr);
    const existentes = await getVerificacionesDeDeals(conOcr.map((d) => d.data.dealId));

    let migrados = 0;
    let batch = db.batch();
    let operaciones = 0;
    const agregar = async (f: (b: FirebaseFirestore.WriteBatch) => void) => {
      f(batch);
      if (++operaciones >= 400) {
        await batch.commit();
        batch = db.batch();
        operaciones = 0;
      }
    };

    for (const { ref, data: d } of deals) {
      const cambios: Record<string, unknown> = {};
      for (const tipo of ["cotizacion", "comprobante"] as const) {
        const url = tipo === "cotizacion" ? d.cotizacionUrl : d.comprobanteUrl;
        const ruta = url ? rutaDesdeUrlFirmada(url) : null;
        if (ruta) {
          cambios[`${tipo}Path`] = ruta;
          cambios[`${tipo}Url`] = null;
        }
        const ocr = tipo === "cotizacion" ? d.cotizacionOcr : d.comprobanteOcr;
        if (ocr) {
          cambios[`${tipo}Ocr`] = FieldValue.delete();
          if (!existentes.has(`${d.dealId}_${tipo}`)) {
            await agregar((b) =>
              b.set(db.collection("paydesk_verificaciones").doc(`${d.dealId}_${tipo}`), {
                dealId: d.dealId,
                tipo,
                concesionarioId: d.concesionarioId,
                verificacion: ocr,
                recordatorioEn: null,
                actualizadoEn: FieldValue.serverTimestamp(),
              }),
            );
          }
        }
      }
      if (Object.keys(cambios).length === 0) continue;
      await agregar((b) => b.update(ref, cambios));
      migrados++;
    }
    if (operaciones > 0) await batch.commit();

    logger.info(`adminMigrarLigasArchivos: ${migrados} deals migrados por ${admin.email ?? admin.uid}`);
    return { ok: true, migrados, revisados: snap.size };
  },
);
