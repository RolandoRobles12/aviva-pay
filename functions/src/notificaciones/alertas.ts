import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { notificar } from "./notificar";

/**
 * Avisa a Slack (evento `error_sistema`) de un fallo que de otro modo solo
 * quedaría en los logs. Se agrupa por `clave`: la primera vez avisa, y las
 * siguientes dentro de `ventanaMin` solo se cuentan — si Claude se cae, el
 * canal recibe un mensaje, no uno por cada tienda que intentó subir algo.
 *
 * Nunca lanza.
 */
const COLLECTION = "paydesk_alertas";

export function debeAvisar(
  ultimoAviso: number | null,
  ahora: number,
  ventanaMin: number,
): boolean {
  return ultimoAviso === null || ahora - ultimoAviso >= ventanaMin * 60_000;
}

export async function alertar(
  clave: string,
  titulo: string,
  error?: unknown,
  ventanaMin = 30,
): Promise<void> {
  try {
    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc(clave);
    const ahora = Date.now();
    const omitidas = await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const data = snap.data() as { ultimoAviso?: number; omitidas?: number } | undefined;
      if (!debeAvisar(data?.ultimoAviso ?? null, ahora, ventanaMin)) {
        t.set(ref, { omitidas: (data?.omitidas ?? 0) + 1 }, { merge: true });
        return null;
      }
      t.set(ref, { ultimoAviso: ahora, omitidas: 0, titulo });
      return data?.omitidas ?? 0;
    });
    if (omitidas === null) return;

    const detalle =
      (error instanceof Error ? error.message : error ? String(error) : "Sin detalle") +
      (omitidas > 0 ? ` · ${omitidas} más desde el aviso anterior` : "");
    await notificar({ evento: "error_sistema", titulo, detalle });
  } catch (err) {
    logger.error(`alertar: no se pudo avisar "${clave}"`, err);
  }
}
