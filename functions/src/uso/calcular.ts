import type { Dispositivo, Evento, Flujo, Perfil } from "./eventos";

/**
 * Convierte los lotes de eventos en lo que muestra "Uso del portal": sin
 * Firestore, para poder probarlo.
 */

export interface LoteUso {
  uid: string;
  email: string | null;
  perfil: Perfil;
  tiendas: string[];
  sesionId: string;
  dispositivo: Dispositivo;
  eventos: Evento[];
  /** Eventos que el servidor no reconoció al recibir el lote. */
  descartados?: number;
}

export interface PasoEmbudo {
  paso: string;
  intentos: number;
}

export interface Motivo {
  motivo: string;
  veces: number;
}

export interface ResumenUso {
  totales: {
    personas: number;
    sesiones: number;
    minutos: number;
    toques: number;
    frustracion: number;
    sinBoton: number;
    errores: number;
    cortesSenal: number;
    minutosSinSenal: number;
    /** Eventos que llegaron y no se reconocieron: si no es 0, portal y servidor no coinciden. */
    descartados: number;
  };
  embudos: {
    cotizacion: PasoEmbudo[];
    comprobante: PasoEmbudo[];
    vale: PasoEmbudo[];
  };
  /** Por qué un documento no quedó guardado, y por qué un código no terminó en venta. */
  motivos: { documentos: Motivo[]; vale: Motivo[] };
  /** Con qué se capturan los códigos en caja. */
  medios: Motivo[];
  camara: Motivo[];
  porDia: { dia: string; minutos: number; sesiones: number }[];
  /** Minutos de uso por hora del día (hora de la Ciudad de México). */
  porHora: number[];
  pantallas: {
    pantalla: string;
    minutos: number;
    visitas: number;
    toques: number;
    frustracion: number;
    sinBoton: number;
  }[];
  /** Dónde tocan repetido, y dónde tocan algo que no hace nada. */
  frustracion: { pantalla: string; elemento: string; veces: number }[];
  sinBoton: { pantalla: string; elemento: string; veces: number }[];
  personas: {
    uid: string;
    email: string | null;
    perfil: Perfil;
    tiendas: string[];
    sesiones: number;
    minutos: number;
    frustracion: number;
    errores: number;
    documentosGuardados: number;
    codigosConfirmados: number;
    ultimo: number;
  }[];
  errores: { mensaje: string; veces: number; personas: number; pantallas: string[]; ultimo: number }[];
}

const ZONA = "America/Mexico_City";
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "numeric", hourCycle: "h23" });

export function diaLocal(ms: number): string {
  return fmtDia.format(new Date(ms));
}

export function horaLocal(ms: number): number {
  return Number(fmtHora.format(new Date(ms))) % 24;
}

/** Nombres de los pasos y de los resultados, como se leen en el panel. */
const NOMBRE_PASO: Record<string, string> = {
  abrir: "Abrió el formulario",
  archivo: "Eligió el archivo",
  enviar: "Lo envió",
  guardado: "Quedó guardado",
  captura: "Capturó el código",
  valido: "Código válido",
  confirmado: "Confirmó la venta",
};

const MOTIVO_DOCUMENTO: Record<string, string> = {
  rechazado: "La verificación lo rechazó",
  cancelar: "Cerró la ventana sin enviar",
  "sin-archivo": "Envió sin elegir archivo",
  "sin-firma": "No confirmó la firma del cliente",
  "sin-senal": "Sin señal al enviar",
  sesion: "Se le venció la sesión",
  imagen: "No se pudo preparar la foto",
  limite: "Demasiados intentos seguidos",
  servidor: "Error del servidor",
};

const MOTIVO_VALE: Record<string, string> = {
  "no-existe": "Código que no existe (mal tecleado o de otro producto)",
  vencido: "Vale vencido",
  cancelado: "Vale reemplazado por uno nuevo",
  "ya-utilizado": "Vale ya usado",
  "otra-tienda": "Vale de otra tienda",
  error: "Error al validar",
  "monto-invalido": "Monto de la venta no aceptado",
  "confirmar-fallo": "Falló la confirmación",
  "sin-confirmar": "Código válido pero no confirmó la venta",
};

const NOMBRE_MEDIO: Record<string, string> = {
  pistola: "Pistola de la caja",
  camara: "Cámara",
  teclado: "Tecleado a mano",
};

const NOMBRE_CAMARA: Record<string, string> = {
  abrir: "Abrió la cámara",
  leido: "Leyó el código",
  "sin-permiso": "Sin permiso de cámara",
  "no-soportado": "El navegador no puede leer códigos",
  "cerrar-sin-leer": "La cerró sin leer",
};

function sumar<K>(mapa: Map<K, number>, clave: K, n = 1) {
  mapa.set(clave, (mapa.get(clave) ?? 0) + n);
}

function aMotivos(mapa: Map<string, number>, nombres: Record<string, string>): Motivo[] {
  return [...mapa.entries()]
    .map(([k, veces]) => ({ motivo: nombres[k] ?? k, veces }))
    .sort((a, b) => b.veces - a.veces);
}

const minutos = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

/**
 * Un intento de documento: de "abrir" al siguiente "abrir" del mismo
 * flujo en la misma sesión. Así un reintento dentro de la misma ventana
 * no cuenta como otro intento, y cada embudo se lee "de cada 10 veces
 * que abrieron el formulario, en 7 quedó guardado".
 */
interface IntentoDoc {
  archivo: boolean;
  enviar: boolean;
  guardado: boolean;
  /** El último motivo por el que no se guardó, si no se guardó. */
  fallo: string | null;
}

interface IntentoVale {
  valido: boolean;
  confirmado: boolean;
  fallo: string | null;
}

export function calcularUso(lotes: LoteUso[]): ResumenUso {
  const sesiones = new Set<string>();
  const personas = new Map<string, ResumenUso["personas"][number] & { _sesiones: Set<string> }>();
  const pantallas = new Map<string, ResumenUso["pantallas"][number]>();
  const frustracion = new Map<string, number>();
  const sinBoton = new Map<string, number>();
  const errores = new Map<string, { veces: number; uids: Set<string>; pantallas: Set<string>; ultimo: number }>();
  const porDia = new Map<string, { minutos: number; sesiones: Set<string> }>();
  const porHora = new Array<number>(24).fill(0);
  const medios = new Map<string, number>();
  const camara = new Map<string, number>();
  const t = {
    minutosMs: 0,
    toques: 0,
    frustracion: 0,
    sinBoton: 0,
    errores: 0,
    cortesSenal: 0,
    sinSenalMs: 0,
    descartados: 0,
  };

  // Los pasos se recorren en orden por sesión para armar los intentos.
  const pasosPorSesion = new Map<string, { uid: string; e: Extract<Evento, { t: "paso" }> }[]>();

  const pantallaDe = (p: string) => {
    let x = pantallas.get(p);
    if (!x) {
      x = { pantalla: p, minutos: 0, visitas: 0, toques: 0, frustracion: 0, sinBoton: 0 };
      pantallas.set(p, x);
    }
    return x;
  };

  for (const lote of lotes) {
    t.descartados += lote.descartados ?? 0;
    if (lote.eventos.length === 0) continue;
    sesiones.add(lote.sesionId);
    let persona = personas.get(lote.uid);
    if (!persona) {
      persona = {
        uid: lote.uid,
        email: lote.email,
        perfil: lote.perfil,
        tiendas: lote.tiendas,
        sesiones: 0,
        minutos: 0,
        frustracion: 0,
        errores: 0,
        documentosGuardados: 0,
        codigosConfirmados: 0,
        ultimo: 0,
        _sesiones: new Set(),
      };
      personas.set(lote.uid, persona);
    }
    persona._sesiones.add(lote.sesionId);

    for (const e of lote.eventos) {
      persona.ultimo = Math.max(persona.ultimo, e.en);
      switch (e.t) {
        case "pantalla": {
          t.minutosMs += e.ms;
          persona.minutos += e.ms;
          const p = pantallaDe(e.p);
          p.minutos += e.ms;
          p.visitas += 1;
          const dia = porDia.get(diaLocal(e.en)) ?? { minutos: 0, sesiones: new Set<string>() };
          dia.minutos += e.ms;
          dia.sesiones.add(lote.sesionId);
          porDia.set(diaLocal(e.en), dia);
          porHora[horaLocal(e.en)] += e.ms;
          break;
        }
        case "toque": {
          t.toques += 1;
          pantallaDe(e.p).toques += 1;
          if (e.sb) {
            t.sinBoton += 1;
            pantallaDe(e.p).sinBoton += 1;
            sumar(sinBoton, `${e.p}\u0000${e.e}`);
          }
          break;
        }
        case "frustracion": {
          t.frustracion += 1;
          persona.frustracion += 1;
          pantallaDe(e.p).frustracion += 1;
          sumar(frustracion, `${e.p}\u0000${e.e}`);
          break;
        }
        case "error": {
          t.errores += 1;
          persona.errores += 1;
          const x = errores.get(e.m) ?? { veces: 0, uids: new Set<string>(), pantallas: new Set<string>(), ultimo: 0 };
          x.veces += 1;
          x.uids.add(lote.uid);
          x.pantallas.add(e.p);
          x.ultimo = Math.max(x.ultimo, e.en);
          errores.set(e.m, x);
          break;
        }
        case "senal": {
          t.cortesSenal += 1;
          t.sinSenalMs += e.ms;
          break;
        }
        case "paso": {
          const lista = pasosPorSesion.get(lote.sesionId) ?? [];
          lista.push({ uid: lote.uid, e });
          pasosPorSesion.set(lote.sesionId, lista);
          break;
        }
      }
    }
  }

  // --- Embudos ---
  const intentosDoc: Record<"cotizacion" | "comprobante", IntentoDoc[]> = { cotizacion: [], comprobante: [] };
  const intentosVale: IntentoVale[] = [];

  for (const lista of pasosPorSesion.values()) {
    lista.sort((a, b) => a.e.en - b.e.en);
    const abierto: Partial<Record<Flujo, IntentoDoc>> = {};
    let vale: IntentoVale | null = null;

    for (const { uid, e } of lista) {
      const persona = personas.get(uid)!;
      if (e.f === "cotizacion" || e.f === "comprobante") {
        if (e.s === "abrir" || !abierto[e.f]) {
          abierto[e.f] = { archivo: false, enviar: false, guardado: false, fallo: null };
          intentosDoc[e.f].push(abierto[e.f]!);
          if (e.s === "abrir") continue;
        }
        const i = abierto[e.f]!;
        if (e.s === "archivo") i.archivo = true;
        else if (e.s === "enviar" || e.s === "manual") {
          i.archivo = true;
          i.enviar = true;
        } else if (e.s === "aprobado" || e.s === "revision") {
          i.archivo = i.enviar = true;
          if (!i.guardado) persona.documentosGuardados += 1;
          i.guardado = true;
          i.fallo = null;
        } else if (e.s === "rechazado") {
          i.archivo = i.enviar = true;
          if (!i.guardado) i.fallo = "rechazado";
        } else if (e.s === "error") {
          if (!i.guardado) i.fallo = e.d ?? "servidor";
        } else if (e.s === "cancelar") {
          if (!i.guardado && !i.fallo) i.fallo = "cancelar";
        }
      } else if (e.f === "vale") {
        if (e.s === "captura") {
          vale = { valido: false, confirmado: false, fallo: null };
          intentosVale.push(vale);
          if (e.d) sumar(medios, e.d);
          continue;
        }
        if (!vale) {
          vale = { valido: false, confirmado: false, fallo: null };
          intentosVale.push(vale);
        }
        if (e.s === "resultado") {
          if (e.d === "ok") {
            vale.valido = true;
            vale.fallo = null;
          } else {
            vale.fallo = e.d ?? "error";
          }
        } else if (e.s === "confirmado") {
          vale.valido = vale.confirmado = true;
          vale.fallo = null;
          persona.codigosConfirmados += 1;
        } else if (e.s === "monto-invalido" || e.s === "confirmar-fallo") {
          if (!vale.confirmado) vale.fallo = e.s;
        }
      } else if (e.f === "camara") {
        sumar(camara, e.s);
      }
    }
  }

  const embudoDoc = (lista: IntentoDoc[]): PasoEmbudo[] => [
    { paso: NOMBRE_PASO.abrir, intentos: lista.length },
    { paso: NOMBRE_PASO.archivo, intentos: lista.filter((i) => i.archivo).length },
    { paso: NOMBRE_PASO.enviar, intentos: lista.filter((i) => i.enviar).length },
    { paso: NOMBRE_PASO.guardado, intentos: lista.filter((i) => i.guardado).length },
  ];

  const motivosDoc = new Map<string, number>();
  for (const i of [...intentosDoc.cotizacion, ...intentosDoc.comprobante]) {
    if (!i.guardado && i.fallo) sumar(motivosDoc, i.fallo);
  }
  const motivosVale = new Map<string, number>();
  for (const v of intentosVale) {
    if (v.confirmado) continue;
    if (v.fallo) sumar(motivosVale, v.fallo);
    else if (v.valido) sumar(motivosVale, "sin-confirmar");
  }

  const top = (mapa: Map<string, number>) =>
    [...mapa.entries()]
      .map(([k, veces]) => {
        const [pantalla, elemento] = k.split("\u0000");
        return { pantalla, elemento, veces };
      })
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 15);

  return {
    totales: {
      personas: personas.size,
      sesiones: sesiones.size,
      minutos: minutos(t.minutosMs),
      toques: t.toques,
      frustracion: t.frustracion,
      sinBoton: t.sinBoton,
      errores: t.errores,
      cortesSenal: t.cortesSenal,
      minutosSinSenal: minutos(t.sinSenalMs),
      descartados: t.descartados,
    },
    embudos: {
      cotizacion: embudoDoc(intentosDoc.cotizacion),
      comprobante: embudoDoc(intentosDoc.comprobante),
      vale: [
        { paso: NOMBRE_PASO.captura, intentos: intentosVale.length },
        { paso: NOMBRE_PASO.valido, intentos: intentosVale.filter((v) => v.valido).length },
        { paso: NOMBRE_PASO.confirmado, intentos: intentosVale.filter((v) => v.confirmado).length },
      ],
    },
    motivos: {
      documentos: aMotivos(motivosDoc, MOTIVO_DOCUMENTO),
      vale: aMotivos(motivosVale, MOTIVO_VALE),
    },
    medios: aMotivos(medios, NOMBRE_MEDIO),
    camara: aMotivos(camara, NOMBRE_CAMARA),
    porDia: [...porDia.entries()]
      .map(([dia, d]) => ({ dia, minutos: minutos(d.minutos), sesiones: d.sesiones.size }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    porHora: porHora.map(minutos),
    pantallas: [...pantallas.values()]
      .map((p) => ({ ...p, minutos: minutos(p.minutos) }))
      .sort((a, b) => b.minutos - a.minutos),
    frustracion: top(frustracion),
    sinBoton: top(sinBoton),
    personas: [...personas.values()]
      .map(({ _sesiones, ...p }) => ({ ...p, sesiones: _sesiones.size, minutos: minutos(p.minutos) }))
      .sort((a, b) => b.ultimo - a.ultimo),
    errores: [...errores.entries()]
      .map(([mensaje, x]) => ({
        mensaje,
        veces: x.veces,
        personas: x.uids.size,
        pantallas: [...x.pantallas],
        ultimo: x.ultimo,
      }))
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 50),
  };
}

/** Los momentos que vale la pena ver en una grabación, para saltar a ellos. */
export interface Momento {
  en: number;
  tipo: "frustracion" | "error" | "guardado" | "rechazo" | "venta" | "codigo" | "senal";
  texto: string;
}

export function momentosDeSesion(eventos: Evento[]): Momento[] {
  const out: Momento[] = [];
  for (const e of eventos) {
    if (e.t === "frustracion") out.push({ en: e.en, tipo: "frustracion", texto: `${e.n} toques seguidos en "${e.e}"` });
    else if (e.t === "error") out.push({ en: e.en, tipo: "error", texto: e.m });
    else if (e.t === "senal") out.push({ en: e.en, tipo: "senal", texto: `Sin señal ${Math.max(1, Math.round(e.ms / 1000))} s` });
    else if (e.t === "paso") {
      const doc = e.f === "cotizacion" ? "Cotización" : "Comprobante";
      if ((e.f === "cotizacion" || e.f === "comprobante") && (e.s === "aprobado" || e.s === "revision")) {
        out.push({ en: e.en, tipo: "guardado", texto: `${doc} guardado${e.s === "revision" ? " (en revisión)" : ""}` });
      } else if ((e.f === "cotizacion" || e.f === "comprobante") && (e.s === "rechazado" || e.s === "error")) {
        out.push({
          en: e.en,
          tipo: "rechazo",
          texto: `${doc} no se guardó: ${MOTIVO_DOCUMENTO[e.s === "rechazado" ? "rechazado" : e.d ?? "servidor"] ?? e.d}`,
        });
      } else if (e.f === "vale" && e.s === "confirmado") {
        out.push({ en: e.en, tipo: "venta", texto: "Confirmó una venta con código" });
      } else if (e.f === "vale" && e.s === "resultado" && e.d && e.d !== "ok") {
        out.push({ en: e.en, tipo: "codigo", texto: MOTIVO_VALE[e.d] ?? e.d });
      }
    }
  }
  return out.sort((a, b) => a.en - b.en);
}

/** Puntos del mapa de toques de una pantalla en un tipo de equipo. */
export function puntosDePantalla(
  lotes: LoteUso[],
  pantalla: string,
  dispositivo: Dispositivo,
  max = 3000,
): { x: number; y: number; w: number; f: boolean }[] {
  const out: { x: number; y: number; w: number; f: boolean }[] = [];
  for (const l of lotes) {
    if (l.dispositivo !== dispositivo) continue;
    for (const e of l.eventos) {
      if ((e.t === "toque" || e.t === "frustracion") && e.p === pantalla) {
        out.push({ x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), f: e.t === "frustracion" });
      }
    }
  }
  // Los más recientes primero si hay que recortar: se parecen más a la pantalla de hoy.
  return out.slice(-max);
}
