import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { conBitacora } from "./bitacoraConfig";
import { TTL_CONFIG_MS } from "./configCache";

const COLLECTION = "paydesk_config";
const DOC_ID = "notificaciones";

/**
 * Los momentos que pueden avisar a Slack:
 * - `documento_en_revision` — la verificación dejó un documento esperando
 *   a un administrador. Es el aviso principal: sin él, la bandeja se llena
 *   sin que nadie se entere.
 * - `documento_rechazado` — un documento se rechazó al subirlo (ilegible o
 *   de otro tipo). Útil para ver si una tienda insiste con archivos malos.
 * - `revision_resuelta` — un administrador aprobó o rechazó un documento.
 * - `revision_atrasada` — un documento lleva más de `recordatorioHoras` en
 *   revisión sin que nadie lo atienda. Se avisa una vez por documento.
 * - `error_sistema` — algo falló sin que nadie lo viera: Claude no
 *   respondió, HubSpot rechazó una escritura, la sincronización falló, hay
 *   campos sin mapear. Se agrupa para no inundar el canal (ver
 *   notificaciones/alertas.ts).
 */
export const EVENTOS_NOTIFICACION = [
  "documento_en_revision",
  "documento_rechazado",
  "revision_resuelta",
  "revision_atrasada",
  "error_sistema",
] as const;

export type EventoNotificacion = (typeof EVENTOS_NOTIFICACION)[number];

/**
 * A dónde avisar. `valor` es, para un canal, su ID (`C0123ABC`) o su
 * nombre (`#paydesk-revisiones`); para un usuario, su correo de Slack o su
 * ID (`U0123ABC`). El correo se resuelve al ID al momento de enviar.
 */
export interface DestinoNotificacion {
  id: string;
  tipo: "canal" | "usuario";
  valor: string;
  eventos: EventoNotificacion[];
}

export interface NotificacionesConfig {
  activo: boolean;
  destinos: DestinoNotificacion[];
  /** Horas en revisión antes de avisar `revision_atrasada`. 0 apaga el recordatorio. */
  recordatorioHoras: number;
}

export const RECORDATORIO_HORAS_DEFAULT = 4;

const DEFAULT: NotificacionesConfig = {
  activo: false,
  destinos: [],
  recordatorioHoras: RECORDATORIO_HORAS_DEFAULT,
};

let cached: NotificacionesConfig | null = null;
let cacheExpira = 0;

function configDoc() {
  return getFirestore().collection(COLLECTION).doc(DOC_ID);
}

export function esEvento(v: unknown): v is EventoNotificacion {
  return (EVENTOS_NOTIFICACION as readonly string[]).includes(v as string);
}

function sanitize(data: Record<string, unknown> | undefined): NotificacionesConfig {
  if (!data) return { ...DEFAULT };
  const destinos = Array.isArray(data.destinos)
    ? data.destinos.flatMap((d): DestinoNotificacion[] => {
        if (!d || typeof d !== "object") return [];
        const { id, tipo, valor, eventos } = d as Record<string, unknown>;
        if (typeof id !== "string" || typeof valor !== "string" || !valor.trim()) return [];
        if (tipo !== "canal" && tipo !== "usuario") return [];
        return [
          {
            id,
            tipo,
            valor: valor.trim(),
            eventos: Array.isArray(eventos) ? eventos.filter(esEvento) : [],
          },
        ];
      })
    : [];
  const horas = Number(data.recordatorioHoras);
  return {
    activo: data.activo === true,
    destinos,
    recordatorioHoras:
      Number.isFinite(horas) && horas >= 0 && horas <= 168 ? horas : RECORDATORIO_HORAS_DEFAULT,
  };
}

export async function getNotificacionesConfig(): Promise<NotificacionesConfig> {
  if (cached && Date.now() < cacheExpira) return cached;
  return getNotificacionesConfigFresh();
}

export async function getNotificacionesConfigFresh(): Promise<NotificacionesConfig> {
  const snap = await configDoc().get();
  const config = sanitize(snap.exists ? snap.data() : undefined);
  cached = config;
  cacheExpira = Date.now() + TTL_CONFIG_MS;
  return config;
}

export async function setNotificacionesConfig(
  config: NotificacionesConfig,
  actualizadoPor: string,
): Promise<void> {
  await conBitacora(configDoc(), actualizadoPor, (ref) =>
    ref.set({
      ...config,
      actualizadoPor,
      actualizadoEn: FieldValue.serverTimestamp(),
    }),
  );
  cached = null;
}
