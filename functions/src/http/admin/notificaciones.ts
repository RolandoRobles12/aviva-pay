import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { assertSuperAdmin } from "../../auth/adminGuard";
import {
  EVENTOS_NOTIFICACION,
  esEvento,
  getNotificacionesConfigFresh,
  setNotificacionesConfig,
  type DestinoNotificacion,
  type NotificacionesConfig,
} from "../../firestore/notificacionesRepository";
import { enviarPrueba } from "../../notificaciones/notificar";
import { SlackError } from "../../notificaciones/slack";

export const adminGetNotificaciones = onCall({ region: "us-central1" }, async (request) => {
  assertSuperAdmin(request);
  return { config: await getNotificacionesConfigFresh(), eventos: EVENTOS_NOTIFICACION };
});

/** IDs de Slack: canal público `C…`, privado `G…`; persona `U…` o `W…` (Enterprise). */
const CANAL_RE = /^[CG][A-Z0-9]{6,}$/;
const USUARIO_RE = /^[UW][A-Z0-9]{6,}$/;

export function validarDestino(d: Partial<DestinoNotificacion>): DestinoNotificacion {
  // Los IDs de Slack van siempre en mayúsculas; si alguien los pega en
  // minúsculas, se corrigen en vez de rechazarlos.
  const valor = typeof d.valor === "string" ? d.valor.trim().toUpperCase() : "";
  if (typeof d.id !== "string" || !d.id) {
    throw new HttpsError("invalid-argument", "Destino sin id.");
  }
  if (d.tipo === "canal") {
    if (!CANAL_RE.test(valor)) {
      throw new HttpsError(
        "invalid-argument",
        `"${valor}" no es un ID de canal. Debe empezar con C o G, por ejemplo C0123ABCD.`,
      );
    }
  } else if (d.tipo === "usuario") {
    if (!USUARIO_RE.test(valor)) {
      throw new HttpsError(
        "invalid-argument",
        `"${valor}" no es un ID de persona. Debe empezar con U o W, por ejemplo U0123ABCD.`,
      );
    }
  } else {
    throw new HttpsError("invalid-argument", "Tipo de destino inválido.");
  }
  const eventos = Array.isArray(d.eventos) ? [...new Set(d.eventos.filter(esEvento))] : [];
  return { id: d.id, tipo: d.tipo, valor, eventos };
}

export const adminSetNotificaciones = onCall<{ config?: Partial<NotificacionesConfig> }>(
  { region: "us-central1" },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const config = request.data?.config;
    if (!config || !Array.isArray(config.destinos)) {
      throw new HttpsError("invalid-argument", "config es requerido.");
    }
    if (config.destinos.length > 30) {
      throw new HttpsError("invalid-argument", "Máximo 30 destinos.");
    }
    const horas = Number(config.recordatorioHoras ?? 4);
    if (!Number.isFinite(horas) || horas < 0 || horas > 168) {
      throw new HttpsError("invalid-argument", "El recordatorio debe ser de 0 a 168 horas.");
    }
    const limpio: NotificacionesConfig = {
      activo: config.activo === true,
      destinos: config.destinos.map(validarDestino),
      recordatorioHoras: horas,
    };
    await setNotificacionesConfig(limpio, admin.email ?? admin.uid);
    logger.info(`adminSetNotificaciones: actualizado por ${admin.email ?? admin.uid}`);
    return { ok: true };
  },
);

/** Traduce los errores de Slack más comunes a algo que el admin pueda corregir. */
const ERRORES_SLACK: Record<string, string> = {
  not_authed: "Falta el token del bot (secreto SLACK_BOT_TOKEN).",
  invalid_auth: "El token del bot de Slack no es válido.",
  account_inactive: "El token del bot de Slack fue revocado.",
  channel_not_found:
    "Slack no encontró ese ID. Revisa que esté bien copiado; si es un canal privado, invita al bot al canal.",
  not_in_channel: "El bot no está en el canal. Invítalo con /invite.",
  missing_scope:
    "Al bot le faltan permisos. Necesita chat:write, chat:write.public e im:write.",
};

export const adminProbarNotificacion = onCall<{ destino?: Partial<DestinoNotificacion> }>(
  { region: "us-central1", secrets: ["SLACK_BOT_TOKEN"] },
  async (request) => {
    const admin = assertSuperAdmin(request);
    const destino = validarDestino({ ...request.data?.destino, id: "prueba", eventos: [] });
    try {
      await enviarPrueba(destino, admin.email ?? admin.uid);
      return { ok: true as const, mensaje: "Mensaje de prueba enviado." };
    } catch (err) {
      logger.warn("adminProbarNotificacion: falló", err);
      const mensaje =
        err instanceof SlackError
          ? (ERRORES_SLACK[err.codigo] ?? `Slack respondió: ${err.codigo}`)
          : err instanceof Error && err.message.includes("SLACK_BOT_TOKEN")
            ? ERRORES_SLACK.not_authed
            : "No se pudo enviar el mensaje de prueba.";
      return { ok: false as const, mensaje };
    }
  },
);
