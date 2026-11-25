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
import { urlDealHubspot } from "../hubspot/ligas";

type TipoDocumento = "cotizacion" | "comprobante";

/** Quién dio por bueno el comprobante, para que quien desembolsa sepa cuánto confiar. */
export type VerificadoPor =
  | { como: "automatica" }
  | { como: "sin_verificacion" }
  | { como: "revision"; por: string }
  | { como: "admin" };

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
    }
  | {
      evento: "comprobante_listo_desembolso";
      dealId: string;
      /** La que capturó la tienda con el comprobante (AAAA-MM-DD). */
      fechaEntrega: string | null;
      verificadoPor: VerificadoPor;
    };

/** Lo que el aviso cuenta del deal. Los montos solo los usa el de desembolso. */
export interface ContextoDeal {
  cliente: string;
  tienda: string;
  montoAprobado?: number | null;
  montoCompra?: number | null;
  desembolsoFecha?: string | null;
}

const DOCUMENTO: Record<TipoDocumento, string> = {
  cotizacion: "cotización",
  comprobante: "comprobante de entrega",
};

/** Texto de Slack (mrkdwn): escapa lo que Slack interpreta como formato. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function contexto(dealId: string): Promise<ContextoDeal> {
  const deal = await getDeal(dealId);
  const tienda = deal?.concesionarioId ? await getConcesionario(deal.concesionarioId) : null;
  return {
    cliente: deal?.cliente ?? "Sin nombre",
    tienda: tienda?.nombre ?? deal?.kiosco ?? "Sin tienda",
    montoAprobado: deal?.montoAprobado ?? null,
    montoCompra: deal?.cotizacionMontoTotalCompra ?? null,
    desembolsoFecha: deal?.desembolsoFecha ?? null,
  };
}

const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function pesos(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? PESOS.format(n) : "Sin dato";
}

/** AAAA-MM-DD (o un ISO completo) → DD/MM/AAAA, sin pasar por zonas horarias. */
function fecha(s: string | null | undefined): string {
  if (!s) return "Sin dato";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(s);
}

function textoVerificacion(v: VerificadoPor): string {
  switch (v.como) {
    case "automatica":
      return "Verificación automática";
    case "sin_verificacion":
      return "Sin verificar: la verificación automática está apagada";
    case "revision":
      return `Aprobado en revisión por ${esc(v.por)}`;
    case "admin":
      return "Lo subió un administrador desde el panel";
  }
}

/**
 * El aviso para quien sigue con el desembolso: quién es el cliente, cuánto
 * se le aprobó y cuánto compró, cuándo recibió el material y cómo se
 * verificó el comprobante, con un botón al deal en HubSpot, donde se
 * registra el desembolso. Tampoco lleva al archivo (ver construirMensaje).
 */
function mensajeDesembolso(
  aviso: Extract<Aviso, { evento: "comprobante_listo_desembolso" }>,
  ctx: ContextoDeal | null,
  urlHubspot: string | null,
): { texto: string; blocks: unknown[] } {
  const titulo = ":white_check_mark: Comprobante de entrega verificado: listo para desembolso";
  const quien = ctx ? `*${esc(ctx.cliente)}* · ${esc(ctx.tienda)} · ` : "";
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${titulo}*\n${quien}deal ${esc(aviso.dealId)}` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Monto aprobado*\n${pesos(ctx?.montoAprobado)}` },
        { type: "mrkdwn", text: `*Compra en tienda*\n${pesos(ctx?.montoCompra)}` },
        { type: "mrkdwn", text: `*Fecha de entrega*\n${fecha(aviso.fechaEntrega)}` },
        { type: "mrkdwn", text: `*Verificación*\n${textoVerificacion(aviso.verificadoPor)}` },
      ],
    },
  ];
  if (ctx?.desembolsoFecha) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:warning: Esta solicitud ya tiene fecha de desembolso (${fecha(ctx.desembolsoFecha)}). Es un comprobante nuevo: revisa antes de volver a desembolsar.`,
        },
      ],
    });
  }
  if (urlHubspot) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir solicitud en HubSpot" },
          url: urlHubspot,
          style: "primary",
        },
      ],
    });
  } else {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `No se pudo armar la liga a HubSpot: busca el deal ${esc(aviso.dealId)}.`,
        },
      ],
    });
  }
  const sufijo = ctx ? ` — ${ctx.cliente} (${ctx.tienda})` : "";
  return { texto: `Comprobante verificado, listo para desembolso${sufijo}`, blocks };
}

/**
 * El mensaje de cada evento. Lleva a la bandeja de revisión, nunca al
 * archivo: la liga del archivo es una URL firmada que abre sin sesión, y
 * pegarla en Slack la repartiría a todo el canal.
 */
export function construirMensaje(
  aviso: Aviso,
  ctx: ContextoDeal | null,
  urlRevision: string,
  urlHubspot: string | null = null,
): { texto: string; blocks: unknown[] } {
  if (aviso.evento === "comprobante_listo_desembolso") {
    return mensajeDesembolso(aviso, ctx, urlHubspot);
  }
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
      aviso.evento === "comprobante_listo_desembolso" ? await urlDealHubspot(aviso.dealId) : null,
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
