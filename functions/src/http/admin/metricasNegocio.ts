import { onCall } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { dealsCollection } from "../../firestore/dealsRepository";
import { eventosDesde } from "../../firestore/eventosDocumentoRepository";
import { listConcesionarios } from "../../firestore/concesionariosRepository";
import { getRolloutFresh, resolveRolloutForStore } from "../../firestore/rolloutRepository";
import { intentosDesde, listarVales } from "../../firestore/valesRepository";
import { actividadDesde, getUsoConfig } from "../../firestore/usoRepository";
import { calcularMetricasNegocio, type DealNegocio } from "../../metricas/negocio";
import { esPeriodo, resolverPeriodo } from "../../metricas/periodos";


const iso = (t: FirebaseFirestore.Timestamp | null | undefined) => t?.toDate().toISOString() ?? null;

/**
 * Métricas del negocio (/admin/metricas): lo que Paydesk le cambia al negocio, del periodo elegido
 * contra el anterior. Ver metricas/negocio.ts y metricas/periodos.ts.
 * Cualquier admin.
 */
export const adminMetricasNegocio = onCall<{ periodo?: string }>(
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 120 },
  async (request) => {
    assertAdmin(request);
    const periodo = esPeriodo(request.data?.periodo) ? request.data!.periodo : "90";
    const ahora = new Date();
    const { actual, anterior } = resolverPeriodo(periodo, ahora);
    // Desde el inicio del periodo anterior: con eso se calculan los dos.
    const desde = new Date(anterior.desde);

    const [dealsSnap, vales, concesionarios, rollout, eventos, intentos, personas, usoConfig] = await Promise.all([
      dealsCollection()
        .select(
          "dealId",
          "concesionarioId",
          "cancelado",
          "fechaSolicitud",
          "montoAprobado",
          "creditoLiberadoFecha",
          "cotizacionEstatus",
          "comprobanteEntregaEstatus",
          "desembolsoFecha",
          "canceladoFecha",
        )
        .get(),
      listarVales(),
      listConcesionarios(),
      getRolloutFresh(),
      eventosDesde(desde),
      intentosDesde(desde),
      actividadDesde(desde),
      getUsoConfig(),
    ]);

    const deals = dealsSnap.docs.map((d) => ({ ...(d.data() as DealNegocio), dealId: d.id }));

    return calcularMetricasNegocio({
      actual,
      anterior,
      ahora,
      diasRetencionUso: usoConfig.diasInteracciones,
      deals,
      vales: vales.map((v) => ({
        codigo: v.codigo,
        dealId: v.dealId,
        concesionarioId: v.concesionarioId,
        estado: v.estado,
        montoAutorizado: v.montoAutorizado,
        montoDispuesto: v.montoDispuesto,
        emitidoEn: iso(v.emitidoEn),
        consumidoEn: iso(v.consumidoEn),
        ultimaLecturaEn: iso(v.ultimaLecturaEn),
        venceEn: v.venceEn,
        lecturasTotal: v.lecturasTotal ?? 0,
        reemplazaA: v.reemplazaA ?? null,
      })),
      tiendas: concesionarios.map((c) => ({
        concesionarioId: c.concesionarioId,
        nombre: c.nombre,
        rolloutDesde: resolveRolloutForStore(rollout, c.rolloutDesde),
        habilitada: (c.usuarios ?? []).length > 0,
      })),
      eventos: eventos
        .filter((e) => e.en)
        .map((e) => ({ concesionarioId: e.concesionarioId, resultado: e.resultado, en: e.en.toDate().toISOString() })),
      intentos,
      personas,
    });
  },
);
