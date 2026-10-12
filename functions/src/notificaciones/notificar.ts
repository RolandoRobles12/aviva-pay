import { logger } from "firebase-functions/v2";
import { env } from "../config/env";
import { getDeal } from "../firestore/dealsRepository";
import { getConcesionario } from "../firestore/concesionariosRepository";
import {
  getNotificacionesConfig,
  type DestinoNotificacion,
  type EventoNotificacion,
} from "../firestore/notificacionesRepository";
import { publicar, resolverCanal } from "./slack";

type TipoDocumento = "cotizacion" | "comprobante";

export type Aviso =
  | { evento: "documento_en_revision"; dealId: string; tipo: TipoDocumento; motivos: string[] }
  | { evento: "revision_atrasada"; dealId: string; tipo: TipoDocumento; horas: number }
  | { evento: "error_sistema"; titulo: string; detalle: string }
  | { evento: "documento_rechazado"; dealId: string; tipo: TipoDocumento; motivo: string }
  | {
      evento: "revision_resuelta";
      dealId: string;
      tipo: TipoDocumento;
      decision: "aprobar" | "rechazar";
      comentario: string;
      resueltoPor: string;
    };

const DOCUMENTO: Record<TipoDocumento, string> = {
  cotizacion: "cotización",
  comprobante: "comprobante de entrega",
};

/** Texto de Slack (mrkdwn): escapa lo que Slack interpreta como formato. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function contexto(dealId: string) {
  const deal = await getDeal(dealId);
  const tienda = deal?.concesionarioId ? await getConcesionario(deal.concesionarioId) : null;
  return {
    cliente: deal?.cliente ?? "Sin nombre",
    tienda: tienda?.nombre ?? deal?.kiosco ?? "Sin tienda",
  };
}

/**
 * El mensaje de cada evento. Lleva a la bandeja de revisión, nunca al
 * archivo: la liga del archivo es una URL firmada que abre sin sesión, y
 * pegarla en Slack la repartiría a todo el canal.
 */
export function construirMensaje(
  aviso: Aviso,
  ctx: { cliente: string; tienda: string } | null,
  urlRevision: string,
): { texto: string; blocks: unknown[] } {
  if (aviso.evento === "error_sistema") {
    const titulo = `:rotating_light: ${aviso.titulo}`;
    return {
      texto: titulo,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*${esc(titulo)}*` } },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: esc(aviso.detalle).slice(0, 2900) }],
        },
      ],
    };
  }

  const doc = DOCUMENTO[aviso.tipo];
  const quien = ctx ? `*${esc(ctx.cliente)}* · ${esc(ctx.tienda)}` : "";
  let titulo: string;
  let detalle: string;

  switch (aviso.evento) {
    case "documento_en_revision":
      titulo = `:mag: Documento en revisión: ${doc}`;
      detalle = aviso.motivos.length
        ? aviso.motivos.map((m) => `• ${esc(m)}`).join("\n")
        : "La verificación automática no lo pudo dar por bueno.";
      break;
    case "revision_atrasada":
      titulo = `:hourglass: Revisión atrasada: ${doc}`;
      detalle = `Lleva ${aviso.horas} h esperando a un administrador. La tienda lo ve “En revisión” hasta que alguien lo apruebe o rechace.`;
      break;
    case "documento_rechazado":
      titulo = `:no_entry: Documento rechazado al subir: ${doc}`;
      detalle = esc(aviso.motivo);
      break;
    case "revision_resuelta":
      titulo =
        aviso.decision === "aprobar"
          ? `:white_check_mark: ${doc[0].toUpperCase()}${doc.slice(1)} aprobado`
          : `:x: ${doc[0].toUpperCase()}${doc.slice(1)} rechazado`;
      detalle =
        `Por ${esc(aviso.resueltoPor)}` + (aviso.comentario ? `: ${esc(aviso.comentario)}` : "");
      break;
  }

  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${titulo}*\n${quien} · deal ${aviso.dealId}` } },
    { type: "section", text: { type: "mrkdwn", text: detalle } },
  ];
  if (aviso.evento === "documento_en_revision" || aviso.evento === "revision_atrasada") {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir revisión" },
          url: urlRevision,
          style: "primary",
        },
      ],
    });
  }
  const sufijo = ctx ? ` — ${ctx.cliente} (${ctx.tienda})` : "";
  return { texto: `${titulo}${sufijo}`, blocks };
}

async function enviarA(destino: DestinoNotificacion, mensaje: { texto: string; blocks: unknown[] }) {
  const channel = await resolverCanal(destino);
  await publicar(channel, mensaje.texto, mensaje.blocks);
}

/**
 * Avisa a cada destino suscrito al evento. Nunca lanza: un Slack caído o
 * mal configurado no debe tumbar la subida de una tienda ni la decisión de
 * un administrador. Los fallos quedan en los logs con el destino.
 *
 * Devuelve a cuántos destinos se entregó, para quien necesite saber si el
 * aviso llegó (el recordatorio solo se da por enviado si llegó).
 */
export async function notificar(aviso: Aviso): Promise<{ entregados: number }> {
  try {
    const config = await getNotificacionesConfig();
    if (!config.activo) return { entregados: 0 };
    const destinos = config.destinos.filter((d) => d.eventos.includes(aviso.evento));
    if (destinos.length === 0) return { entregados: 0 };

    const mensaje = construirMensaje(
      aviso,
      "dealId" in aviso ? await contexto(aviso.dealId) : null,
      `${env.payDeskBaseUrl}/admin/revision`,
    );
    const resultados = await Promise.allSettled(destinos.map((d) => enviarA(d, mensaje)));
    resultados.forEach((r, i) => {
      if (r.status === "rejected") {
        logger.error(
          `notificar: no se pudo avisar a ${destinos[i].tipo} ${destinos[i].valor} (${aviso.evento})`,
          r.reason,
        );
      }
    });
    return { entregados: resultados.filter((r) => r.status === "fulfilled").length };
  } catch (err) {
    logger.error(`notificar: falló el aviso ${aviso.evento}`, err);
    return { entregados: 0 };
  }
}

/** Para el botón de prueba del admin: lanza el error real de Slack, a diferencia de `notificar`. */
export async function enviarPrueba(
  destino: Pick<DestinoNotificacion, "tipo" | "valor">,
  enviadoPor: string,
): Promise<void> {
  const channel = await resolverCanal(destino);
  await publicar(channel, "Prueba de notificaciones de Aviva Paydesk", [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:wave: *Prueba de notificaciones de Aviva Paydesk*\nEnviada por ${esc(enviadoPor)}. Si ves esto, este destino está bien configurado.`,
      },
    },
  ]);
}

export type { EventoNotificacion };
