import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
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
import { valeVencido } from "../../vale/validar";

/**
 * El estado de un vale para efectos del reporte. `vencido` no es un
 * estado guardado —se deriva de la fecha— así que se calcula aquí, igual
 * que lo hace la caja al validar.
 */
function estadoParaReporte(vale: {
  estado: string;
  venceEn: string;
  emitidoEn: FirebaseFirestore.Timestamp;
}): "vigente" | "utilizado" | "vencido" | "cancelado" {
  if (vale.estado === "utilizado") return "utilizado";
  if (vale.estado === "cancelado") return "cancelado";
  return valeVencido(vale as never) ? "vencido" : "vigente";
}

/**
 * El reporte de vales: qué tanto del crédito liberado se está ejerciendo,
 * y qué tanto se está quedando en el aire.
 *
 * La cifra que motiva todo esto es **"nunca se gastó"** — vales que
 * vencieron o se cancelaron sin usarse. Cada uno es un crédito que Aviva
 * liberó, aprovisionó, y que nadie ejerció: es la lista para adelantar
 * cancelaciones en vez de esperar a que el plazo corra solo.
 *
 * La segunda es **autorizado contra dispuesto**: cuánto del crédito
 * aprobado se gastó de verdad. Ese número solo existe en Paydesk, porque
 * el monto dispuesto no se escribe a HubSpot (escribirlo pisaría el monto
 * de la cotización, que significa otra cosa).
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

  const totales = { vigente: 0, utilizado: 0, vencido: 0, cancelado: 0 };
  let montoAutorizadoUtilizado = 0;
  let montoDispuesto = 0;
  let montoNuncaGastado = 0;
  // Entre los que murieron sin usarse, ¿el cliente llegó siquiera al
  // mostrador? Es el corte que cambia qué se hace al respecto: si casi
  // nadie llegó, el problema está antes de la tienda y se ataca con
  // recordatorios; si llegaron y no se completó, el problema está en la
  // caja. La expiración no tiene etapa propia en HubSpot, así que este
  // hecho es lo más cerca que se puede estar del motivo sin inventarlo.
  let muertosNuncaLeidos = 0;
  let muertosLeidosSinUsar = 0;

  const porTienda = new Map<
    string,
    {
      concesionarioId: string;
      tienda: string;
      vigente: number;
      utilizado: number;
      vencido: number;
      cancelado: number;
      montoDispuesto: number;
      montoNuncaGastado: number;
    }
  >();

  for (const vale of vales) {
    const estado = estadoParaReporte(vale);
    totales[estado] += 1;

    const fila = porTienda.get(vale.concesionarioId) ?? {
      concesionarioId: vale.concesionarioId,
      tienda: nombrePorTienda.get(vale.concesionarioId) ?? vale.concesionarioId,
      vigente: 0,
      utilizado: 0,
      vencido: 0,
      cancelado: 0,
      montoDispuesto: 0,
      montoNuncaGastado: 0,
    };
    fila[estado] += 1;

    if (estado === "utilizado") {
      montoAutorizadoUtilizado += vale.montoAutorizado ?? 0;
      montoDispuesto += vale.montoDispuesto ?? 0;
      fila.montoDispuesto += vale.montoDispuesto ?? 0;
    }

    // Vencido o cancelado sin haberse usado: crédito liberado que nadie
    // ejerció. Un cancelado por reemisión no cuenta como perdido — lo
    // reemplazó otro vale, y ese otro ya aparece con su propio estado.
    if (estado === "vencido" || (estado === "cancelado" && !vale.reemplazaA)) {
      montoNuncaGastado += vale.montoAutorizado ?? 0;
      fila.montoNuncaGastado += vale.montoAutorizado ?? 0;
      if (vale.lecturasTotal > 0) muertosLeidosSinUsar += 1;
      else muertosNuncaLeidos += 1;
    }

    porTienda.set(vale.concesionarioId, fila);
  }

  return {
    totales,
    sinUsar: {
      nuncaLeidos: muertosNuncaLeidos,
      leidosSinUsar: muertosLeidosSinUsar,
    },
    montos: {
      autorizadoDeUtilizados: montoAutorizadoUtilizado,
      dispuesto: montoDispuesto,
      /** Lo que se autorizó de más frente a lo que de verdad se gastó. */
      subejercido: montoAutorizadoUtilizado - montoDispuesto,
      nuncaGastado: montoNuncaGastado,
    },
    porTienda: [...porTienda.values()].sort((a, b) =>
      a.tienda.localeCompare(b.tienda, "es"),
    ),
  };
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
    const admin = assertAdmin(request);
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
