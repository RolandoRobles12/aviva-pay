import type { ResultadoEvento } from "../firestore/eventosDocumentoRepository";

/**
 * Documentos por tienda (/admin/revision/tiendas), para que quien revisa
 * documentos vea patrones, no casos sueltos: cuántos sube cada tienda, qué
 * tanto caen en revisión o se rechazan, y cuánto tarda Aviva en atender sus
 * revisiones. Lo del negocio (desembolsos, días, control) está en
 * metricas/negocio.ts. Pura (sin Firestore) para poder probarla.
 */
export interface EventoParaMetricas {
  concesionarioId: string | null;
  resultado: ResultadoEvento;
  minutosEnRevision?: number | null;
}

export interface DocumentosTienda {
  concesionarioId: string;
  nombre: string;
  documentos: number;
  aceptados: number;
  enRevision: number;
  rechazadosAuto: number;
  aprobadosAdmin: number;
  rechazadosAdmin: number;
  tasaRevision: number | null;
  tasaRechazo: number | null;
  minutosAtencion: number | null;
  /** Por qué conviene mirar esta tienda; vacío si nada destaca. */
  alertas: string[];
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Con menos documentos que esto, una tasa no dice nada. */
const MIN_DOCUMENTOS = 3;

export function calcularDocumentosPorTienda(
  eventos: EventoParaMetricas[],
  nombres: Map<string, string>,
): { tiendas: DocumentosTienda[]; global: Omit<DocumentosTienda, "concesionarioId" | "nombre" | "alertas"> } {
  const crear = (id: string): DocumentosTienda => ({
    concesionarioId: id,
    nombre: nombres.get(id) ?? id,
    documentos: 0,
    aceptados: 0,
    enRevision: 0,
    rechazadosAuto: 0,
    aprobadosAdmin: 0,
    rechazadosAdmin: 0,
    tasaRevision: null,
    tasaRechazo: null,
    minutosAtencion: null,
    alertas: [],
  });
  const porTienda = new Map<string, DocumentosTienda>();
  const tienda = (id: string) => {
    let t = porTienda.get(id);
    if (!t) porTienda.set(id, (t = crear(id)));
    return t;
  };
  const atencion = new Map<string, number[]>();
  const todaAtencion: number[] = [];

  for (const e of eventos) {
    if (!e.concesionarioId) continue;
    const t = tienda(e.concesionarioId);
    switch (e.resultado) {
      case "aceptado":
        t.aceptados++;
        break;
      case "en_revision":
        t.enRevision++;
        break;
      case "rechazado_auto":
        t.rechazadosAuto++;
        break;
      case "aprobado_admin":
        t.aprobadosAdmin++;
        break;
      case "rechazado_admin":
        t.rechazadosAdmin++;
        break;
    }
    if ((e.resultado === "aprobado_admin" || e.resultado === "rechazado_admin") && e.minutosEnRevision != null) {
      (atencion.get(e.concesionarioId) ??
        atencion.set(e.concesionarioId, []).get(e.concesionarioId)!).push(e.minutosEnRevision);
      todaAtencion.push(e.minutosEnRevision);
    }
  }

  const completar = (t: Omit<DocumentosTienda, "concesionarioId" | "nombre" | "alertas">) => {
    // Subidas: lo que la tienda intentó subir (aceptado, en revisión o rechazado al subir).
    t.documentos = t.aceptados + t.enRevision + t.rechazadosAuto;
    t.tasaRevision = t.documentos ? t.enRevision / t.documentos : null;
    t.tasaRechazo = t.documentos ? (t.rechazadosAuto + t.rechazadosAdmin) / t.documentos : null;
  };

  const global = crear("global");
  for (const t of porTienda.values()) {
    t.minutosAtencion = mediana(atencion.get(t.concesionarioId) ?? []);
    completar(t);
    for (const k of ["aceptados", "enRevision", "rechazadosAuto", "aprobadosAdmin", "rechazadosAdmin"] as const) {
      global[k] += t[k];
    }
  }
  completar(global);
  global.minutosAtencion = mediana(todaAtencion);

  for (const t of porTienda.values()) {
    if (t.documentos >= MIN_DOCUMENTOS && t.tasaRevision !== null && global.tasaRevision) {
      if (t.tasaRevision >= Math.max(2 * global.tasaRevision, 0.2)) {
        t.alertas.push(`${Math.round(t.tasaRevision * 100)}% de sus documentos caen en revisión`);
      }
    }
    if (t.rechazadosAuto + t.rechazadosAdmin >= MIN_DOCUMENTOS) {
      t.alertas.push(`${t.rechazadosAuto + t.rechazadosAdmin} documentos rechazados`);
    }
  }

  const { concesionarioId: _c, nombre: _n, alertas: _a, ...globalSinId } = global;
  const tiendas = [...porTienda.values()].sort(
    (a, b) => b.alertas.length - a.alertas.length || b.documentos - a.documentos || a.nombre.localeCompare(b.nombre, "es"),
  );
  return { tiendas, global: globalSinId };
}
