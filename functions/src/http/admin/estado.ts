import { onCall } from "firebase-functions/v2/https";
import { assertSuperAdmin } from "../../auth/adminGuard";
import { getFieldDictionaryFresh } from "../../firestore/fieldDictionaryRepository";
import { getSyncEstado } from "../../firestore/syncEstadoRepository";
import { getNotificacionesConfigFresh } from "../../firestore/notificacionesRepository";
import { getOcrConfigFresh } from "../../firestore/ocrConfigRepository";
import { dealsCollection } from "../../firestore/dealsRepository";
import { camposSinMapear } from "../../programadas/revisionDiaria";
import type { PayDeskDeal } from "../../types/deal";

/**
 * Lo que un super admin necesita para saber si Paydesk está sano, en un
 * solo lugar: campos sin mapear, cómo va la sincronización periódica, la
 * bandeja de revisión y si los avisos están prendidos.
 */
export const adminEstadoSistema = onCall({ region: "us-central1" }, async (request) => {
  assertSuperAdmin(request);

  const [diccionario, sync, notif, ocr, cot, comp] = await Promise.all([
    getFieldDictionaryFresh(),
    getSyncEstado(),
    getNotificacionesConfigFresh(),
    getOcrConfigFresh(),
    dealsCollection().where("cotizacionRevision.estado", "==", "pendiente").get(),
    dealsCollection().where("comprobanteRevision.estado", "==", "pendiente").get(),
  ]);

  const subidas = [
    ...cot.docs.map((d) => (d.data() as PayDeskDeal).cotizacionRevision?.subidoEn),
    ...comp.docs.map((d) => (d.data() as PayDeskDeal).comprobanteRevision?.subidoEn),
  ].filter((v): v is string => Boolean(v));
  const masAntigua = subidas.length ? Math.min(...subidas.map((s) => Date.parse(s))) : null;

  return {
    camposSinMapear: camposSinMapear(diccionario),
    sync,
    revisiones: {
      pendientes: subidas.length,
      masAntiguaHoras: masAntigua === null ? null : Math.floor((Date.now() - masAntigua) / 3_600_000),
    },
    notificaciones: {
      activo: notif.activo,
      destinos: notif.destinos.length,
      recordatorioHoras: notif.recordatorioHoras,
    },
    verificacion: ocr,
  };
});
