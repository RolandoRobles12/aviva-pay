import { createHash } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

/**
 * Límite de solicitudes por ventana fija, guardado en Firestore para que
 * valga entre instancias. Protege lo que cuesta dinero (cada subida es una
 * llamada a Claude) y lo que se puede abusar (probar códigos de vale en
 * volumen).
 *
 * `paydesk_rate` no tiene reglas de lectura; cada documento trae `expira`
 * para poder activar una política TTL de Firestore que los borre solos.
 */
const COLLECTION = "paydesk_rate";

export interface OpcionesLimite {
  max: number;
  ventanaSeg: number;
}

export interface EstadoVentana {
  inicio: number;
  cuenta: number;
}

/** La decisión, sin Firestore, para poder probarla. */
export function decidir(
  estado: EstadoVentana | null,
  ahora: number,
  { max, ventanaSeg }: OpcionesLimite,
): { permitido: boolean; siguiente: EstadoVentana } {
  if (!estado || ahora - estado.inicio >= ventanaSeg * 1000) {
    return { permitido: true, siguiente: { inicio: ahora, cuenta: 1 } };
  }
  if (estado.cuenta >= max) return { permitido: false, siguiente: estado };
  return { permitido: true, siguiente: { inicio: estado.inicio, cuenta: estado.cuenta + 1 } };
}

export const MENSAJE_LIMITE = "Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.";

/**
 * Cuenta una solicitud de `clave` (un uid, una IP, un token) para `accion`
 * y lanza `resource-exhausted` si ya se pasó del límite.
 */
export async function limitar(accion: string, clave: string, opts: OpcionesLimite): Promise<void> {
  const db = getFirestore();
  const id = `${accion}_${createHash("sha256").update(clave).digest("hex").slice(0, 32)}`;
  const ref = db.collection(COLLECTION).doc(id);
  const permitido = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const estado = snap.exists ? (snap.data() as EstadoVentana) : null;
    const ahora = Date.now();
    const r = decidir(estado, ahora, opts);
    if (r.permitido) {
      t.set(ref, {
        ...r.siguiente,
        expira: Timestamp.fromMillis(r.siguiente.inicio + opts.ventanaSeg * 1000),
      });
    }
    return r.permitido;
  });
  if (!permitido) throw new HttpsError("resource-exhausted", MENSAJE_LIMITE);
}

export function esLimiteExcedido(err: unknown): boolean {
  return err instanceof HttpsError && err.code === "resource-exhausted";
}
