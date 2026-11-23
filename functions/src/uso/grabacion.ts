import { createHash } from "crypto";

/**
 * Qué sesiones se graban, decidido en el servidor:
 * - todas las de una persona que Aviva eligió, hasta la fecha que puso
 *   (1, 3 o 7 días, para ver qué le pasa a una tienda en particular);
 * - y si no, un porcentaje al azar (10 % por defecto).
 *
 * El azar sale del id de la sesión y no de `Math.random()`: así la misma
 * sesión recibe la misma respuesta en cada lote, y `subirGrabacion` puede
 * comprobar que un fragmento es de una sesión que sí tocaba grabar, sin
 * guardar la decisión en ningún lado.
 */
export const PORCENTAJE_GRABACION_DEFAULT = 10;
export const DIAS_RETENCION_DEFAULT = 365;
export const DIAS_GRABAR_PERSONA = [1, 3, 7] as const;

export interface UsoConfig {
  /** 0 a 100. 0 apaga las grabaciones al azar (las de personas elegidas siguen). */
  porcentajeGrabacion: number;
  /** Correo en minúsculas → hasta cuándo grabar todas sus sesiones (epoch ms). */
  grabarHasta: Record<string, number>;
  /** Cuántos días se guardan los eventos y las grabaciones. */
  diasInteracciones: number;
  diasGrabaciones: number;
}

export const USO_CONFIG_DEFAULT: UsoConfig = {
  porcentajeGrabacion: PORCENTAJE_GRABACION_DEFAULT,
  grabarHasta: {},
  diasInteracciones: DIAS_RETENCION_DEFAULT,
  diasGrabaciones: DIAS_RETENCION_DEFAULT,
};

/** 0–99, estable para un mismo id de sesión. */
export function cubeta(sesionId: string): number {
  return createHash("sha256").update(sesionId).digest().readUInt32BE(0) % 100;
}

export function debeGrabar(
  config: Pick<UsoConfig, "porcentajeGrabacion" | "grabarHasta">,
  sesionId: string,
  email: string | null,
  ahora: number,
): boolean {
  const hasta = email ? config.grabarHasta[email.toLowerCase()] : undefined;
  if (hasta && hasta > ahora) return true;
  return cubeta(sesionId) < config.porcentajeGrabacion;
}

/** Tope de un fragmento ya comprimido: un documento de Firestore aguanta 1 MiB. */
export const MAX_BYTES_FRAGMENTO = 900 * 1024;
