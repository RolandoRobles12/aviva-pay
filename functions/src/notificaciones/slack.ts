import { env } from "../config/env";

/**
 * Cliente mínimo de la Web API de Slack: Paydesk solo necesita publicar
 * mensajes, así que no vale la pena una dependencia completa.
 *
 * Los destinos se guardan por ID (canal `C…`/`G…`, persona `U…`/`W…`):
 * un ID no cambia si renombran el canal o la persona cambia de correo, y
 * con el ID de una persona chat.postMessage le escribe por mensaje directo.
 *
 * El bot (una app de Slack del workspace de Aviva) necesita los scopes
 * `chat:write`, `chat:write.public` (publicar en canales públicos sin que
 * lo inviten) e `im:write` (mensajes directos). Para un canal privado,
 * además, hay que invitarlo al canal.
 */
export class SlackError extends Error {
  constructor(public readonly codigo: string) {
    super(`Slack respondió: ${codigo}`);
  }
}

async function llamar<T>(metodo: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${metodo}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.slackBotToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new SlackError(`http_${res.status}`);
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new SlackError(data.error ?? "error_desconocido");
  return data;
}

export async function publicar(channel: string, texto: string, blocks: unknown[]): Promise<void> {
  await llamar("chat.postMessage", {
    channel,
    text: texto,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  });
}
