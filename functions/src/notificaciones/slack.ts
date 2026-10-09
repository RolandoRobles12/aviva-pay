import { env } from "../config/env";

/**
 * Cliente mínimo de la Web API de Slack: Paydesk solo necesita publicar
 * mensajes y resolver un correo a un usuario, así que no vale la pena una
 * dependencia completa.
 *
 * El bot (una app de Slack del workspace de Aviva) necesita los scopes
 * `chat:write`, `chat:write.public` (publicar en canales públicos sin que
 * lo inviten), `im:write` (mensajes directos) y `users:read.email`
 * (encontrar a alguien por su correo). Para un canal privado, además, hay
 * que invitarlo al canal.
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

const idsPorCorreo = new Map<string, string>();

/** Correo de Slack → ID de usuario (U…). Se recuerda mientras viva la instancia. */
async function usuarioPorCorreo(email: string): Promise<string> {
  const clave = email.toLowerCase();
  const enCache = idsPorCorreo.get(clave);
  if (enCache) return enCache;
  // users.lookupByEmail solo acepta GET con query string.
  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(clave)}`,
    {
      headers: { Authorization: `Bearer ${env.slackBotToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const data = (await res.json()) as { ok: boolean; error?: string; user?: { id: string } };
  if (!data.ok || !data.user) throw new SlackError(data.error ?? "users_not_found");
  idsPorCorreo.set(clave, data.user.id);
  return data.user.id;
}

/** El `channel` que acepta chat.postMessage para un destino configurado. */
export async function resolverCanal(destino: {
  tipo: "canal" | "usuario";
  valor: string;
}): Promise<string> {
  if (destino.tipo === "canal") return destino.valor.replace(/^#/, "");
  // A un usuario se le escribe por mensaje directo: con su ID, Slack abre
  // (o reutiliza) la conversación del bot con esa persona.
  return destino.valor.includes("@") ? usuarioPorCorreo(destino.valor) : destino.valor;
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
