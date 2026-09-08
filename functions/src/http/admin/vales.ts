import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertAdmin } from "../../auth/adminGuard";
import { getDeal } from "../../firestore/dealsRepository";
import { getConcesionario } from "../../firestore/concesionariosRepository";
import { getValeVigenteDeDeal } from "../../firestore/valesRepository";
import { getValeConfig, setValeConfig } from "../../firestore/valeConfigRepository";
import { emitirValeParaDeal, urlDelVale } from "../../vale/emitir";
import { formatearCodigo } from "../../vale/codigo";
import { valeVencido } from "../../vale/validar";
import type { PayDeskVale } from "../../types/vale";

async function describirVale(vale: PayDeskVale) {
  const concesionario = await getConcesionario(vale.concesionarioId);
  return {
    codigo: vale.codigo,
    codigoFormateado: formatearCodigo(vale.codigo),
    url: urlDelVale(vale.token),
    dealId: vale.dealId,
    cliente: vale.cliente,
    tienda: concesionario?.nombre ?? vale.concesionarioId,
    montoAutorizado: vale.montoAutorizado,
    estado:
      vale.estado === "emitido" && valeVencido(vale) ? "vencido" : vale.estado,
    emitidoEn: vale.emitidoEn?.toDate().toISOString() ?? null,
    venceEn: vale.venceEn,
    lecturasTotal: vale.lecturasTotal,
    ultimaLecturaEn: vale.ultimaLecturaEn?.toDate().toISOString() ?? null,
    consumidoEn: vale.consumidoEn?.toDate().toISOString() ?? null,
    montoDispuesto: vale.montoDispuesto,
  };
}

/** El vale vigente de un deal, con todo su detalle — solo para el equipo de Aviva. */
export const adminGetVale = onCall<{ dealId?: string }>(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);
    const dealId = (request.data?.dealId ?? "").trim();
    if (!dealId) {
      throw new HttpsError("invalid-argument", "Falta el id del deal.");
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      throw new HttpsError("not-found", "No encontramos esa solicitud en Paydesk.");
    }

    const vale = await getValeVigenteDeDeal(dealId);
    return {
      deal: {
        dealId: deal.dealId,
        cliente: deal.cliente,
        montoAprobado: deal.montoAprobado,
        creditoLiberadoFecha: deal.creditoLiberadoFecha,
      },
      vale: vale ? await describirVale(vale) : null,
    };
  },
);

/**
 * Reemite el vale de un deal — el caso "el cliente perdió el código".
 *
 * Solo un admin de Aviva. Deliberadamente no lo puede hacer la tienda:
 * si pudiera, podría generarse un vale sin el cliente presente, que es
 * justo el fraude que el mecanismo intenta cerrar.
 *
 * Emitir el nuevo cancela el anterior en el mismo paso, así que un vale
 * viejo que ande circulando deja de servir en el momento en que nace su
 * reemplazo.
 */
export const adminReemitirVale = onCall<{ dealId?: string }>(
  { region: "us-central1", secrets: ["HUBSPOT_PRIVATE_APP_TOKEN"] },
  async (request) => {
    const admin = assertAdmin(request);
    const dealId = (request.data?.dealId ?? "").trim();
    if (!dealId) {
      throw new HttpsError("invalid-argument", "Falta el id del deal.");
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      throw new HttpsError("not-found", "No encontramos esa solicitud en Paydesk.");
    }

    const resultado = await emitirValeParaDeal(deal, {
      emitidoPor: admin.email ?? admin.uid,
      forzar: true,
    });

    if (!resultado.vale) {
      const motivos: Record<string, string> = {
        "sin-concesionario": "Esta solicitud todavía no tiene tienda asignada.",
        "ya-utilizado":
          "El vale de esta solicitud ya se usó: el crédito se dispuso. No se puede reemitir.",
        "credito-no-liberado": "El crédito de esta solicitud todavía no se libera.",
      };
      throw new HttpsError(
        "failed-precondition",
        motivos[resultado.motivo] ?? "No se pudo reemitir el vale.",
      );
    }

    logger.info(
      `adminReemitirVale: deal ${dealId} reemitido por ${admin.email ?? admin.uid}`,
    );

    return { ok: true as const, vale: await describirVale(resultado.vale) };
  },
);

export const adminGetValeConfig = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return await getValeConfig();
});

export const adminSetValeConfig = onCall<{ vigenciaHoras?: number }>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertAdmin(request);
    const horas = Number(request.data?.vigenciaHoras);

    if (!Number.isInteger(horas) || horas < 1 || horas > 720) {
      throw new HttpsError(
        "invalid-argument",
        "La vigencia debe ser un número entero de horas, entre 1 y 720 (30 días).",
      );
    }

    await setValeConfig(horas, admin.email ?? admin.uid);
    logger.info(
      `adminSetValeConfig: vigencia = ${horas}h por ${admin.email ?? admin.uid}`,
    );
    return { ok: true as const };
  },
);
