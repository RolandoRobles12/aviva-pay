import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { generarCodigo, generarToken } from "../vale/codigo";
import type {
  PayDeskVale,
  ValeIntentoFallido,
  ValeEstado,
  ValeMedioLectura,
  ValeResultadoLectura,
} from "../types/vale";

const COLLECTION = "paydesk_vales";
const INTENTOS = "paydesk_vale_intentos";

export function valesCollection() {
  return getFirestore().collection(COLLECTION);
}

export async function getVale(codigo: string): Promise<PayDeskVale | null> {
  const snap = await valesCollection().doc(codigo).get();
  return snap.exists ? (snap.data() as PayDeskVale) : null;
}

/**
 * Busca por el token de la URL — lo que hace la página pública del vale.
 * `token` es un campo indexado por Firestore automáticamente (índice de
 * un solo campo), así que no hace falta declararlo en
 * firestore.indexes.json.
 */
export async function getValePorToken(token: string): Promise<PayDeskVale | null> {
  const snap = await valesCollection().where("token", "==", token).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as PayDeskVale);
}

/** El vale vigente de un deal, si tiene: el último emitido que no esté cancelado. */
export async function getValeVigenteDeDeal(
  dealId: string,
): Promise<PayDeskVale | null> {
  const snap = await valesCollection().where("dealId", "==", dealId).get();
  if (snap.empty) return null;

  // El estado y el orden se resuelven en memoria, no en la consulta: son
  // un puñado de vales por deal, y así basta con el índice de un solo
  // campo que Firestore crea solo — el proyecto no declara ninguno
  // compuesto (ver firestore.indexes.json).
  const vales = snap.docs
    .map((d) => d.data() as PayDeskVale)
    .filter((v) => v.estado === "emitido" || v.estado === "utilizado")
    .sort((a, b) => b.emitidoEn.toMillis() - a.emitidoEn.toMillis());

  return vales[0] ?? null;
}

/**
 * Crea el vale. Reintenta si el código sorteado ya existía: con 10
 * dígitos la colisión es remotísima, pero `create()` falla en vez de
 * pisar el vale de alguien más, que es la única falla aceptable aquí.
 */
export async function crearVale(datos: {
  dealId: string;
  concesionarioId: string;
  cliente: string | null;
  montoAutorizado: number | null;
  venceEn: string;
  emitidoPor: string;
  reemplazaA?: string | null;
}): Promise<PayDeskVale> {
  const MAX_INTENTOS = 5;

  for (let intento = 0; intento < MAX_INTENTOS; intento += 1) {
    const codigo = generarCodigo();
    const vale: Omit<PayDeskVale, "emitidoEn"> & {
      emitidoEn: FieldValue;
    } = {
      codigo,
      token: generarToken(),
      dealId: datos.dealId,
      concesionarioId: datos.concesionarioId,
      cliente: datos.cliente,
      montoAutorizado: datos.montoAutorizado,
      estado: "emitido",
      emitidoEn: FieldValue.serverTimestamp(),
      venceEn: datos.venceEn,
      lecturasTotal: 0,
      ultimaLecturaEn: null,
      ultimoAccesoEn: null,
      ultimoAccesoUid: null,
      consumidoEn: null,
      consumidoPor: null,
      montoDispuesto: null,
      emitidoPor: datos.emitidoPor,
      reemplazaA: datos.reemplazaA ?? null,
    };

    try {
      await valesCollection().doc(codigo).create(vale);
      const creado = await getVale(codigo);
      if (creado) return creado;
    } catch (err: unknown) {
      // 6 = ALREADY_EXISTS. Cualquier otro error no es una colisión y no
      // se arregla sorteando otro código.
      if ((err as { code?: number })?.code !== 6) throw err;
    }
  }

  throw new Error(
    `crearVale: no se pudo generar un código libre para el deal ${datos.dealId}`,
  );
}

/** Marca vales previos de un deal como cancelados — lo que hace una reemisión. */
export async function cancelarValesDeDeal(
  dealId: string,
  exceptoCodigo?: string,
): Promise<string[]> {
  const snap = await valesCollection().where("dealId", "==", dealId).get();

  const cancelados: string[] = [];
  const batch = getFirestore().batch();
  for (const doc of snap.docs) {
    if (doc.id === exceptoCodigo) continue;
    if ((doc.data() as PayDeskVale).estado !== "emitido") continue;
    batch.update(doc.ref, { estado: "cancelado" satisfies ValeEstado });
    cancelados.push(doc.id);
  }
  if (cancelados.length > 0) await batch.commit();
  return cancelados;
}

/**
 * Cuánto tiempo cuenta como "la misma lectura".
 *
 * Un lector de presentación —los de base, que se quedan encendidos y el
 * cliente le acerca el teléfono— vuelve a decodificar el mismo código
 * cada fracción de segundo mientras la pantalla siga enfrente. Eso es UN
 * acto físico, no diez, y contarlo diez veces convertiría el contador
 * antifraude en ruido: la próxima caja vería "ya se leyó 10 veces" por un
 * cliente que solo dejó el celular apoyado.
 *
 * Un minuto es holgado para que la ráfaga completa de un lector caiga
 * dentro, y corto para que una segunda visita al mostrador — que sí es
 * otra ocasión — cuente aparte.
 */
const MS_MISMA_LECTURA = 60_000;

/**
 * Registra una lectura. Se llama SIEMPRE, incluso cuando el resultado es
 * un error: la bitácora de intentos es justamente lo que permite ver un
 * vale que anda circulando o una tienda probando códigos ajenos.
 *
 * Los contadores del documento suben solo en las lecturas que sí
 * encontraron un vale legítimo para esa tienda; un intento desde otra
 * tienda queda en la bitácora pero no infla el "ya se leyó N veces" que
 * ve la tienda dueña.
 *
 * Devuelve `false` cuando la lectura se descartó por repetida — la misma
 * cuenta pasando el mismo código dentro de la ventana de arriba.
 */
export async function registrarLectura(
  vale: PayDeskVale,
  lectura: {
    resultado: ValeResultadoLectura;
    medio: ValeMedioLectura;
    concesionarioId: string | null;
    uid: string;
    email: string | null;
  },
): Promise<boolean> {
  const repetida =
    vale.ultimoAccesoUid === lectura.uid &&
    vale.ultimoAccesoEn !== null &&
    Date.now() - vale.ultimoAccesoEn.toMillis() < MS_MISMA_LECTURA;

  const valeRef = valesCollection().doc(vale.codigo);

  if (repetida) {
    // Se refresca la marca para que una ráfaga larga siga contando como
    // una sola lectura, pero no se escribe bitácora ni se sube el contador.
    await valeRef.update({ ultimoAccesoEn: FieldValue.serverTimestamp() });
    return false;
  }

  await valeRef.collection("lecturas").add({
    ...lectura,
    en: FieldValue.serverTimestamp(),
  });

  await valeRef.update({
    ultimoAccesoEn: FieldValue.serverTimestamp(),
    ultimoAccesoUid: lectura.uid,
    ...(lectura.resultado === "otra-tienda"
      ? {}
      : {
          lecturasTotal: FieldValue.increment(1),
          ultimaLecturaEn: FieldValue.serverTimestamp(),
        }),
  });

  return true;
}

/** Un intento contra un código que no existe: no hay vale al que colgarlo. */
export async function registrarIntentoFallido(intento: {
  codigo: string;
  motivo: "no-existe" | "otra-tienda";
  medio: ValeMedioLectura;
  concesionarioId: string | null;
  uid: string;
  email: string | null;
}): Promise<void> {
  await getFirestore()
    .collection(INTENTOS)
    .add({ ...intento, en: FieldValue.serverTimestamp() });
}

/**
 * Consume el vale. Va en transacción por una razón concreta: dos cajas de
 * la misma tienda pueden escanear el mismo vale al mismo tiempo, y sin
 * transacción las dos leerían "emitido" y las dos entregarían material.
 *
 * Devuelve `null` si otro consumió primero — el llamador lo traduce a la
 * pantalla de "este vale ya se usó".
 */
export async function consumirVale(
  codigo: string,
  datos: { uid: string; montoDispuesto: number },
): Promise<PayDeskVale | null> {
  const db = getFirestore();
  const valeRef = valesCollection().doc(codigo);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(valeRef);
    if (!snap.exists) return null;

    const vale = snap.data() as PayDeskVale;
    if (vale.estado !== "emitido") return null;

    tx.update(valeRef, {
      estado: "utilizado" satisfies ValeEstado,
      consumidoEn: FieldValue.serverTimestamp(),
      consumidoPor: datos.uid,
      montoDispuesto: datos.montoDispuesto,
    });

    return {
      ...vale,
      estado: "utilizado" as ValeEstado,
      consumidoPor: datos.uid,
      montoDispuesto: datos.montoDispuesto,
      consumidoEn: Timestamp.now(),
    };
  });
}


/** Los intentos sospechosos más recientes, para la pantalla de Aviva. */
export async function listarIntentosFallidos(
  limite = 100,
): Promise<Array<Omit<ValeIntentoFallido, "en"> & { en: string | null }>> {
  const snap = await getFirestore()
    .collection(INTENTOS)
    .orderBy("en", "desc")
    .limit(limite)
    .get();

  return snap.docs.map((doc) => {
    const datos = doc.data() as ValeIntentoFallido;
    return { ...datos, en: datos.en?.toDate().toISOString() ?? null };
  });
}

/**
 * Todos los vales, para el reporte. Sin paginar a propósito: son cientos,
 * no millones, y el reporte necesita el conjunto completo para poder
 * contar. Si algún día crece, aquí es donde hay que meter el filtro por
 * fecha antes de traerlos.
 */
export async function listarVales(): Promise<PayDeskVale[]> {
  const snap = await valesCollection().get();
  return snap.docs.map((doc) => doc.data() as PayDeskVale);
}
