import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin, assertSuperAdmin } from "../../auth/adminGuard";
import {
  listarIntentosFallidos,
  listarVales,
} from "../../firestore/valesRepository";
import { listConcesionarios } from "../../firestore/concesionariosRepository";
import {
  getCancelStagesFresh,
  getCancelStagesDefaults,
  setCancelStages,
} from "../../firestore/cancelStagesRepository";
import { calcularReporteVales } from "../../vale/reporte";

/**
 * El reporte de vales: qué tanto del crédito liberado se está ejerciendo,
 * y qué tanto se está quedando en el aire.
 *
 * La cifra que motiva todo esto es **"nunca se gastó"** — vales que
 * vencieron o se cancelaron sin usarse. Cada uno es un crédito que Aviva
 * liberó, aprovisionó, y que nadie ejerció: es la lista para adelantar
 * cancelaciones en vez de esperar a que el plazo corra solo.
 *
 * La segunda es **crédito contra venta**: en los vales usados, cuánto
 * vendió la tienda por encima de lo que cubría el crédito (la venta puede
 * ser mayor al autorizado, nunca menor). Ese número solo existe en
 * Paydesk, porque el monto de la venta confirmado en caja no se escribe a
 * HubSpot (escribirlo pisaría el monto de la cotización, que significa
 * otra cosa).
 */
export const adminValeReporte = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);

  const [vales, concesionarios] = await Promise.all([
    listarVales(),
    listConcesionarios(),
  ]);

  const nombrePorTienda = new Map(
    concesionarios.map((c) => [c.concesionarioId, c.nombre]),
  );

  return calcularReporteVales(vales, nombrePorTienda);
});

/**
 * Los intentos sospechosos más recientes: códigos que no existen (dedazo,
 * o alguien probando números) y códigos que sí existen pero son de otra
 * tienda — este segundo es el que de verdad importa, porque significa que
 * una tienda tuvo enfrente un vale que no le tocaba.
 *
 * Recolectar esto sin que nadie lo mire no sirve de nada; esta es la
 * pantalla que lo hace mirable.
 */
export const adminValeIntentos = onCall<{ limite?: number }>(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);
    const limite = Math.min(Math.max(Number(request.data?.limite) || 100, 1), 500);
    return { intentos: await listarIntentosFallidos(limite) };
  },
);

export const adminGetCancelStages = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return {
    etapas: await getCancelStagesFresh(),
    defaults: getCancelStagesDefaults(),
  };
});

/**
 * Las etapas de HubSpot que significan "este crédito ya no existe". Editar
 * esto tiene consecuencias inmediatas: en cuanto un deal entra a una de
 * estas etapas, su vale se apaga y deja de servir en cualquier caja.
 */
export const adminSetCancelStages = onCall<{ etapas?: string[] }>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const etapas = request.data?.etapas;

    if (!Array.isArray(etapas)) {
      throw new HttpsError("invalid-argument", "etapas debe ser una lista.");
    }

    const limpias = etapas
      .map((e) => (typeof e === "string" ? e.trim() : ""))
      .filter((e) => e.length > 0);

    if (limpias.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Deja al menos una etapa: una lista vacía significa que ninguna cancelación apagaría un vale.",
      );
    }

    await setCancelStages(limpias, admin.email ?? admin.uid);
    logger.info(
      `adminSetCancelStages: ${limpias.join(", ")} por ${admin.email ?? admin.uid}`,
    );
    return { ok: true as const };
  },
);
