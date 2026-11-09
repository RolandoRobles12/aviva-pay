import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  LECCIONES_POR_CURSO,
  resumirCapacitacion,
  type Curso,
  type LeccionId,
} from "../capacitacion/lecciones";

const COLLECTION = "paydesk_capacitacion";

/**
 * Avance de cada persona en la capacitación, por uid. Es por persona y no
 * por tienda porque quien atiende la caja —o vende— es una persona, y una
 * tienda con tres correos invitados puede tener a dos capacitados y a uno
 * que nunca entró. El correo va copiado para que el panel lo cruce con las
 * listas de cada tienda sin leer Firebase Auth.
 *
 * Hay dos cursos (tienda y vendedor) y cada persona toma el de su perfil.
 * Las lecciones de los dos viven en la misma lista porque sus ids no se
 * repiten; la fecha de término y la bienvenida van por curso, para que
 * cambiar de perfil no herede las de otro. Los campos sin sufijo son los
 * de la tienda (así se guardaban antes de existir el curso del vendedor).
 */
interface CapacitacionDoc {
  uid: string;
  email: string | null;
  /** El curso de la última vez que avanzó: el de su perfil. */
  curso?: Curso;
  lecciones: string[];
  bienvenidaVista?: boolean;
  bienvenidaVistaVendedor?: boolean;
  iniciadaEn: Timestamp | null;
  completaEn?: Timestamp | null;
  completaEnVendedor?: Timestamp | null;
  actualizadaEn: Timestamp | null;
}

const campo = {
  bienvenida: (c: Curso): "bienvenidaVista" | "bienvenidaVistaVendedor" =>
    c === "tienda" ? "bienvenidaVista" : "bienvenidaVistaVendedor",
  completa: (c: Curso): "completaEn" | "completaEnVendedor" =>
    c === "tienda" ? "completaEn" : "completaEnVendedor",
};

/** Lo que recibe cada persona de su propio avance. */
export interface CapacitacionTienda {
  completadas: LeccionId[];
  total: number;
  completa: boolean;
  bienvenidaVista: boolean;
}

/** Lo que ve Aviva de cada correo. */
export interface CapacitacionAdmin {
  curso: Curso;
  completadas: number;
  total: number;
  completaEn: string | null;
  actualizadaEn: string | null;
}

function coleccion() {
  return getFirestore().collection(COLLECTION);
}

function resumen(doc: Partial<CapacitacionDoc> | undefined, curso: Curso): CapacitacionTienda {
  const r = resumirCapacitacion(doc?.lecciones, curso);
  return { ...r, bienvenidaVista: Boolean(doc?.[campo.bienvenida(curso)]) };
}

export async function getCapacitacion(uid: string, curso: Curso = "tienda"): Promise<CapacitacionTienda> {
  const snap = await coleccion().doc(uid).get();
  return resumen(snap.exists ? (snap.data() as CapacitacionDoc) : undefined, curso);
}

/**
 * Anota una lección pasada y/o que ya vio la bienvenida. En transacción
 * porque la fecha de término depende de cuántas lleva: dos pestañas
 * terminando lecciones a la vez no deben dejarla sin fecha.
 */
export async function registrarCapacitacion(
  uid: string,
  email: string | null,
  curso: Curso,
  cambio: { leccion?: LeccionId; bienvenidaVista?: boolean },
): Promise<CapacitacionTienda> {
  const db = getFirestore();
  const ref = coleccion().doc(uid);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const actual = snap.exists ? (snap.data() as CapacitacionDoc) : undefined;
    const lecciones = new Set(actual?.lecciones ?? []);
    if (cambio.leccion) lecciones.add(cambio.leccion);
    // Se conservan las de cualquier curso, en el orden de cada uno.
    const lista = [...LECCIONES_POR_CURSO.tienda, ...LECCIONES_POR_CURSO.vendedor].filter((id) =>
      lecciones.has(id),
    );
    const completa = resumirCapacitacion(lista, curso).completa;
    const bienvenida = campo.bienvenida(curso);
    const termino = campo.completa(curso);
    const bienvenidaVista = Boolean(actual?.[bienvenida] || cambio.bienvenidaVista);

    t.set(
      ref,
      {
        uid,
        email,
        curso,
        lecciones: lista,
        [bienvenida]: bienvenidaVista,
        actualizadaEn: FieldValue.serverTimestamp(),
        ...(actual?.iniciadaEn || !cambio.leccion
          ? {}
          : { iniciadaEn: FieldValue.serverTimestamp() }),
        // Se fija una vez: si después se agrega una lección, conserva
        // cuándo terminó el curso que había, y el panel muestra "7 de 8".
        ...(completa && !actual?.[termino] ? { [termino]: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
    return resumen({ lecciones: lista, [bienvenida]: bienvenidaVista }, curso);
  });
}

/** Todo el avance, por correo en minúsculas, para el catálogo de tiendas del panel. */
export async function listCapacitacionPorCorreo(): Promise<Record<string, CapacitacionAdmin>> {
  const snap = await coleccion().get();
  const resultado: Record<string, CapacitacionAdmin> = {};
  for (const doc of snap.docs) {
    const d = doc.data() as CapacitacionDoc;
    if (!d.email) continue;
    const curso = d.curso ?? "tienda";
    const r = resumirCapacitacion(d.lecciones, curso);
    resultado[d.email.toLowerCase()] = {
      curso,
      completadas: r.completadas.length,
      total: r.total,
      completaEn: r.completa ? d[campo.completa(curso)]?.toDate().toISOString() ?? null : null,
      actualizadaEn: d.actualizadaEn?.toDate().toISOString() ?? null,
    };
  }
  return resultado;
}
