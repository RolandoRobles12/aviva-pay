import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { dealsCollection } from "../../firestore/dealsRepository";
import { getConcesionariosByIds } from "../../firestore/concesionariosRepository";
import {
  resolverRevision,
  RevisionNoPendienteError,
  type TipoDocumento,
} from "../../hubspot/uploads";
import type { PayDeskDeal } from "../../types/deal";

/**
 * Los documentos que la verificación automática dejó en revisión, de todas
 * las tiendas, el más antiguo primero: es la bandeja de trabajo del equipo.
 */
export const adminListRevisiones = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);

  const [cotizaciones, comprobantes] = await Promise.all(
    (["cotizacion", "comprobante"] as const).map((tipo) =>
      dealsCollection().where(`${tipo}Revision.estado`, "==", "pendiente").get(),
    ),
  );

  const items = [
    ...cotizaciones.docs.map((d) => ({ tipo: "cotizacion" as const, deal: d.data() as PayDeskDeal })),
    ...comprobantes.docs.map((d) => ({ tipo: "comprobante" as const, deal: d.data() as PayDeskDeal })),
  ];

  const ids = [...new Set(items.map((i) => i.deal.concesionarioId).filter((v): v is string => !!v))];
  const tiendas = ids.length ? await getConcesionariosByIds(ids) : [];
  const nombre = new Map(tiendas.map((t) => [t.concesionarioId, t.nombre]));

  return {
    revisiones: items
      .map(({ tipo, deal }) => ({
        dealId: deal.dealId,
        tipo,
        cliente: deal.cliente,
        tienda: (deal.concesionarioId && nombre.get(deal.concesionarioId)) ?? deal.kiosco,
        montoAprobado: deal.montoAprobado,
        revision: tipo === "cotizacion" ? deal.cotizacionRevision! : deal.comprobanteRevision!,
        verificacion: (tipo === "cotizacion" ? deal.cotizacionOcr : deal.comprobanteOcr) ?? null,
      }))
      .sort((a, b) => a.revision.subidoEn.localeCompare(b.revision.subidoEn)),
  };
});

interface ResolverRequest {
  dealId?: string;
  tipo?: TipoDocumento;
  decision?: "aprobar" | "rechazar";
  comentario?: string;
}

/** Aprueba (aplica en HubSpot y marca completado) o rechaza un documento en revisión. */
export const adminResolverRevision = onCall<ResolverRequest>(
  { region: "us-central1", secrets: ["HUBSPOT_PRIVATE_APP_TOKEN"], timeoutSeconds: 120 },
  async (request) => {
    const admin = assertAdmin(request);
    const { dealId, tipo, decision } = request.data ?? {};
    const comentario = (request.data?.comentario ?? "").trim();

    if (!dealId || (tipo !== "cotizacion" && tipo !== "comprobante")) {
      throw new HttpsError("invalid-argument", "dealId y tipo son requeridos.");
    }
    if (decision !== "aprobar" && decision !== "rechazar") {
      throw new HttpsError("invalid-argument", "Decisión inválida.");
    }
    if (decision === "rechazar" && !comentario) {
      throw new HttpsError(
        "invalid-argument",
        "Escribe el motivo del rechazo: es lo que verá la tienda.",
      );
    }

    try {
      await resolverRevision({
        dealId,
        tipo,
        decision,
        comentario,
        resueltoPor: admin.email ?? admin.uid,
      });
    } catch (err) {
      if (err instanceof RevisionNoPendienteError) {
        throw new HttpsError("failed-precondition", err.message);
      }
      throw err;
    }
    return { ok: true };
  },
);
