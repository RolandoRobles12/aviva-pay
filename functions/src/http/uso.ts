import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { exigirAppCheck } from "../auth/appCheck";
import { limitar } from "../auth/rateLimit";
import {
  corregirReloj,
  DISPOSITIVOS,
  eventosValidos,
  LoteSchema,
  perfilDeClaims,
  limpiarTexto,
} from "../uso/eventos";
import { debeGrabar, MAX_BYTES_FRAGMENTO } from "../uso/grabacion";
import {
  GrabacionAjenaError,
  getUsoConfig,
  guardarFragmento,
  guardarLote,
} from "../firestore/usoRepository";

function quien(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  const uid = request.auth?.uid;
  const perfil = perfilDeClaims(request.auth?.token);
  if (!uid || !perfil) {
    throw new HttpsError("unauthenticated", "Inicia sesión con tu tienda.");
  }
  const email = (request.auth?.token?.email as string | undefined)?.toLowerCase() ?? null;
  return { uid, email, ...perfil };
}

/**
 * El portal manda, cada minuto, lo que juntó de cómo se está usando
 * (ver web/src/lib/analitica.ts), y de paso pregunta si esta sesión se
 * graba. Quién manda sale del token, nunca del cuerpo.
 *
 * Un lote sin eventos no escribe nada: es solo la pregunta de si se graba,
 * que el portal hace en cuanto abre.
 */
export const registrarInteracciones = onCall(
  { region: "us-central1" },
  async (request) => {
    const persona = quien(request);
    exigirAppCheck(request);
    // Uno por minuto por pestaña, más los de cuando se oculta la página.
    await limitar("interacciones", persona.uid, { max: 60, ventanaSeg: 600 });

    const parsed = LoteSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Lote inválido.");
    const { sesionId, dispositivo, ahora, eventos: crudos } = parsed.data;

    const config = await getUsoConfig();
    const ahoraServidor = Date.now();
    const eventos = corregirReloj(eventosValidos(crudos), ahora, ahoraServidor);
    if (eventos.length > 0) {
      await guardarLote(
        {
          ...persona,
          sesionId,
          dispositivo,
          desde: Timestamp.fromMillis(Math.min(...eventos.map((e) => e.en))),
          eventos,
        },
        config.diasInteracciones,
      );
    }
    return { grabar: debeGrabar(config, sesionId, persona.email, ahoraServidor) };
  },
);

const FragmentoSchema = z.object({
  sesionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  n: z.number().int().min(0).max(5000),
  inicio: z.number().finite().min(0),
  fin: z.number().finite().min(0),
  ahora: z.number().finite().min(0),
  dispositivo: z.enum(DISPOSITIVOS),
  ancho: z.number().int().min(1).max(10_000),
  alto: z.number().int().min(1).max(10_000),
  pantallas: z.array(z.string().max(200)).max(30),
  /** gzip de los eventos de rrweb en JSON, en base64. */
  datos: z.string().min(1).max(Math.ceil((MAX_BYTES_FRAGMENTO * 4) / 3) + 4),
});

/**
 * Un pedazo de ~1 minuto de una sesión grabada (ver
 * web/src/lib/grabacion.ts). Solo se acepta si a esta sesión le tocaba
 * grabarse: la misma regla que respondió registrarInteracciones, así que
 * nadie puede llenar Firestore de grabaciones a mano.
 */
export const subirGrabacion = onCall(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    const persona = quien(request);
    exigirAppCheck(request);
    await limitar("grabacion", persona.uid, { max: 40, ventanaSeg: 600 });

    const parsed = FragmentoSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Fragmento inválido.");
    const f = parsed.data;

    const config = await getUsoConfig();
    const ahoraServidor = Date.now();
    const hasta = persona.email ? config.grabarHasta[persona.email] : undefined;
    const elegida = Boolean(hasta && hasta > ahoraServidor);
    if (!debeGrabar(config, f.sesionId, persona.email, ahoraServidor)) {
      // Pudo cambiar la configuración a media sesión: no es un error de la tienda.
      return { ok: false as const, grabar: false };
    }

    const datos = Buffer.from(f.datos, "base64");
    if (datos.length > MAX_BYTES_FRAGMENTO) {
      throw new HttpsError("invalid-argument", "Fragmento demasiado grande.");
    }
    const delta = ahoraServidor - f.ahora;

    try {
      await guardarFragmento({
        sesionId: f.sesionId,
        ...persona,
        dispositivo: f.dispositivo,
        elegida,
        diasRetencion: config.diasGrabaciones,
        fragmento: {
          n: f.n,
          inicio: Math.round(f.inicio + delta),
          fin: Math.round(f.fin + delta),
          datos,
          bytes: datos.length,
          pantallas: [...new Set(f.pantallas.map((p) => limpiarTexto(p, 60)))],
          ancho: f.ancho,
          alto: f.alto,
        },
      });
    } catch (err) {
      if (err instanceof GrabacionAjenaError) {
        logger.warn("subirGrabacion: sesión de otra cuenta", { uid: persona.uid, sesionId: f.sesionId });
        throw new HttpsError("permission-denied", "Esa sesión no es tuya.");
      }
      throw err;
    }
    return { ok: true as const, grabar: true };
  },
);
