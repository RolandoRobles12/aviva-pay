import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentReference,
} from "firebase-admin/firestore";

/**
 * Bitácora de cambios de configuración: quién cambió qué documento de
 * `paydesk_config`, cuándo, y cómo estaba antes y cómo quedó. Antes solo
 * se guardaba "quién lo cambió por última vez", sin forma de saber qué
 * había antes ni de deshacer un cambio equivocado.
 */
const COLLECTION = "paydesk_config_bitacora";

const META = new Set(["actualizadoPor", "actualizadoEn"]);

/** El documento sin sus campos de metadatos, para comparar antes y después. */
export function sinMeta(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return Object.fromEntries(Object.entries(data).filter(([k]) => !META.has(k)));
}

export interface EntradaBitacora {
  documento: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  por: string;
  en: Timestamp;
}

/** Escribe con `escribir` y deja en la bitácora el antes y el después. Si nada cambió, no registra. */
export async function conBitacora(
  ref: DocumentReference,
  por: string,
  escribir: (ref: DocumentReference) => Promise<unknown>,
): Promise<void> {
  const antes = sinMeta((await ref.get()).data());
  await escribir(ref);
  const despues = sinMeta((await ref.get()).data());
  if (JSON.stringify(antes) === JSON.stringify(despues)) return;
  await getFirestore().collection(COLLECTION).add({
    documento: ref.id,
    antes,
    despues,
    por,
    en: FieldValue.serverTimestamp(),
  });
}

export async function listarBitacora(limite: number): Promise<EntradaBitacora[]> {
  const snap = await getFirestore()
    .collection(COLLECTION)
    .orderBy("en", "desc")
    .limit(limite)
    .get();
  return snap.docs.map((d) => d.data() as EntradaBitacora);
}
