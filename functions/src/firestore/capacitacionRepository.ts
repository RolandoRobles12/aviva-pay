import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  LECCIONES_CAPACITACION,
  resumirCapacitacion,
  type LeccionId,
} from "../capacitacion/lecciones";

const COLLECTION = "paydesk_capacitacion";

/**
 * Avance de cada persona de tienda en la capacitación, por uid. Es por
 * persona y no por tienda porque quien atiende la caja es una persona, y
 * una tienda con tres correos invitados puede tener a dos capacitados y a
 * uno que nunca entró. El correo va copiado para que el panel lo cruce con
 * `usuarios` de cada tienda sin leer Firebase Auth.
 */
interface CapacitacionDoc {
  uid: string;
  email: string | null;
  lecciones: string[];
  /** Ya vio la bienvenida del primer ingreso (la tomara o no). */
  bienvenidaVista: boolean;
  iniciadaEn: Timestamp | null;
  completaEn: Timestamp | null;
  actualizadaEn: Timestamp | null;
}

/** Lo que recibe la tienda de su propio avance. */
export interface CapacitacionTienda {
  completadas: LeccionId[];
  total: number;
  completa: boolean;
  bienvenidaVista: boolean;
}

/** Lo que ve Aviva de cada correo. */
export interface CapacitacionAdmin {
  completadas: number;
  total: number;
  completaEn: string | null;
  actualizadaEn: string | null;
}

function coleccion() {
  return getFirestore().collection(COLLECTION);
}

function aTienda(doc: Partial<CapacitacionDoc> | undefined): CapacitacionTienda {
  const r = resumirCapacitacion(doc?.lecciones);
  return { ...r, bienvenidaVista: Boolean(doc?.bienvenidaVista) };
}

export async function getCapacitacion(uid: string): Promise<CapacitacionTienda> {
  const snap = await coleccion().doc(uid).get();
  return aTienda(snap.exists ? (snap.data() as CapacitacionDoc) : undefined);
}

/**
 * Anota una lección pasada y/o que ya vio la bienvenida. En transacción
 * porque `completaEn` depende de cuántas lleva: dos pestañas terminando
 * lecciones a la vez no deben dejarla sin fecha de término.
 */
export async function registrarCapacitacion(
  uid: string,
  email: string | null,
  cambio: { leccion?: LeccionId; bienvenidaVista?: boolean },
): Promise<CapacitacionTienda> {
  const db = getFirestore();
  const ref = coleccion().doc(uid);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const actual = snap.exists ? (snap.data() as CapacitacionDoc) : undefined;
    const lecciones = new Set(actual?.lecciones ?? []);
    if (cambio.leccion) lecciones.add(cambio.leccion);
    const lista = LECCIONES_CAPACITACION.filter((id) => lecciones.has(id));
    const completa = lista.length === LECCIONES_CAPACITACION.length;
    const bienvenidaVista = Boolean(actual?.bienvenidaVista || cambio.bienvenidaVista);

    t.set(
      ref,
      {
        uid,
        email,
        lecciones: lista,
        bienvenidaVista,
        actualizadaEn: FieldValue.serverTimestamp(),
        ...(actual?.iniciadaEn || !cambio.leccion
          ? {}
          : { iniciadaEn: FieldValue.serverTimestamp() }),
        // Se fija una vez: si después se agrega una lección, conserva
        // cuándo terminó el curso que había, y el panel muestra "7 de 8".
        ...(completa && !actual?.completaEn ? { completaEn: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
    return aTienda({ lecciones: lista, bienvenidaVista });
  });
}

/** Todo el avance, por correo en minúsculas, para el catálogo de tiendas del panel. */
export async function listCapacitacionPorCorreo(): Promise<Record<string, CapacitacionAdmin>> {
  const snap = await coleccion().get();
  const resultado: Record<string, CapacitacionAdmin> = {};
  for (const doc of snap.docs) {
    const d = doc.data() as CapacitacionDoc;
    if (!d.email) continue;
    const r = resumirCapacitacion(d.lecciones);
    resultado[d.email.toLowerCase()] = {
      completadas: r.completadas.length,
      total: r.total,
      completaEn: r.completa ? d.completaEn?.toDate().toISOString() ?? null : null,
      actualizadaEn: d.actualizadaEn?.toDate().toISOString() ?? null,
    };
  }
  return resultado;
}
