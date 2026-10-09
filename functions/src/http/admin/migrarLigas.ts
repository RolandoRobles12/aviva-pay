import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertSuperAdmin } from "../../auth/adminGuard";
import { dealsCollection } from "../../firestore/dealsRepository";
import { rutaDesdeUrlFirmada } from "../../storage/dealFiles";
import type { PayDeskDeal } from "../../types/deal";
import { FieldValue } from "firebase-admin/firestore";
import { guardarVerificacion } from "../../firestore/verificacionesRepository";
import type { ResultadoOcr } from "../../ocr/validarDocumento";

/**
 * Migración de una sola vez, para dejar el deal sin nada que la tienda no
 * deba ver:
 * - quita la URL firmada permanente de su cotización/comprobante y guarda
 *   solo la ruta;
 * - mueve el resultado de la verificación (`cotizacionOcr` /
 *   `comprobanteOcr`, que una versión anterior guardaba en el deal) a su
 *   colección privada.
 *
 * Ojo: las ligas que ya se compartieron no se invalidan con esto — siguen
 * firmadas. Ver docs/ARCHITECTURE.md ("Ligas de archivos").
 *
 * Idempotente: un deal ya migrado no tiene URL de Storage y se salta.
 */
export const adminMigrarLigasArchivos = onCall(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const snap = await dealsCollection().get();
    let migrados = 0;
    let batch = dealsCollection().firestore.batch();
    let enBatch = 0;

    for (const doc of snap.docs) {
      const d = doc.data() as PayDeskDeal;
      const cambios: Record<string, unknown> = {};
      const viejo = d as PayDeskDeal & { cotizacionOcr?: ResultadoOcr; comprobanteOcr?: ResultadoOcr };
      for (const tipo of ["cotizacion", "comprobante"] as const) {
        const url = tipo === "cotizacion" ? d.cotizacionUrl : d.comprobanteUrl;
        const ruta = url ? rutaDesdeUrlFirmada(url) : null;
        if (ruta) {
          cambios[`${tipo}Path`] = ruta;
          cambios[`${tipo}Url`] = null;
        }
        const ocr = tipo === "cotizacion" ? viejo.cotizacionOcr : viejo.comprobanteOcr;
        if (ocr) {
          await guardarVerificacion({
            dealId: d.dealId,
            tipo,
            concesionarioId: d.concesionarioId,
            verificacion: ocr,
          });
          cambios[`${tipo}Ocr`] = FieldValue.delete();
        }
      }
      if (Object.keys(cambios).length === 0) continue;
      batch.update(doc.ref, cambios);
      migrados++;
      if (++enBatch === 400) {
        await batch.commit();
        batch = dealsCollection().firestore.batch();
        enBatch = 0;
      }
    }
    if (enBatch > 0) await batch.commit();

    logger.info(`adminMigrarLigasArchivos: ${migrados} deals migrados por ${admin.email ?? admin.uid}`);
    return { ok: true, migrados, revisados: snap.size };
  },
);
