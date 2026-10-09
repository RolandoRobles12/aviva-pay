import type { ResultadoEvento } from "../firestore/eventosDocumentoRepository";

/**
 * Métricas por tienda para que Aviva vea patrones, no casos sueltos:
 * cuánto tarda un crédito de aprobación a desembolso, qué tanto caen sus
 * documentos en revisión o se rechazan, y cuánto tarda Aviva en atender
 * sus revisiones. Pura (sin Firestore) para poder probarla.
 */
export interface DealParaMetricas {
  concesionarioId: string | null;
  cancelado?: boolean;
  fechaSolicitud: string | null;
  desembolsoFecha: string | null;
}

export interface EventoParaMetricas {
  concesionarioId: string | null;
  resultado: ResultadoEvento;
  minutosEnRevision?: number | null;
}

export interface MetricasTienda {
  concesionarioId: string;
  nombre: string;
  solicitudes: number;
  desembolsadas: number;
  diasADesembolso: number | null;
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

const DIA_MS = 86_400_000;
/** Con menos documentos que esto, una tasa no dice nada. */
const MIN_DOCUMENTOS = 3;

export function calcularMetricas(
  deals: DealParaMetricas[],
  eventos: EventoParaMetricas[],
  nombres: Map<string, string>,
  desde: Date,
): { tiendas: MetricasTienda[]; global: Omit<MetricasTienda, "concesionarioId" | "nombre" | "alertas"> } {
  const crear = (id: string): MetricasTienda => ({
    concesionarioId: id,
    nombre: nombres.get(id) ?? id,
    solicitudes: 0,
    desembolsadas: 0,
    diasADesembolso: null,
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
  const porTienda = new Map<string, MetricasTienda>();
  const tienda = (id: string) => {
    let t = porTienda.get(id);
    if (!t) porTienda.set(id, (t = crear(id)));
    return t;
  };
  const dias = new Map<string, number[]>();
  const atencion = new Map<string, number[]>();
  const todosDias: number[] = [];
  const todaAtencion: number[] = [];

  for (const d of deals) {
    if (!d.concesionarioId || d.cancelado) continue;
    const enPeriodo = d.fechaSolicitud && Date.parse(d.fechaSolicitud) >= desde.getTime();
    const desembolsoEnPeriodo = d.desembolsoFecha && Date.parse(d.desembolsoFecha) >= desde.getTime();
    if (!enPeriodo && !desembolsoEnPeriodo) continue;
    const t = tienda(d.concesionarioId);
    if (enPeriodo) t.solicitudes++;
    if (desembolsoEnPeriodo) {
      t.desembolsadas++;
      if (d.fechaSolicitud) {
        const n = (Date.parse(d.desembolsoFecha!) - Date.parse(d.fechaSolicitud)) / DIA_MS;
        if (n >= 0) {
          (dias.get(d.concesionarioId) ?? dias.set(d.concesionarioId, []).get(d.concesionarioId)!).push(n);
          todosDias.push(n);
        }
      }
    }
  }

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

  const completar = (t: Omit<MetricasTienda, "concesionarioId" | "nombre" | "alertas">) => {
    // Subidas: lo que la tienda intentó subir (aceptado, en revisión o rechazado al subir).
    t.documentos = t.aceptados + t.enRevision + t.rechazadosAuto;
    t.tasaRevision = t.documentos ? t.enRevision / t.documentos : null;
    t.tasaRechazo = t.documentos ? (t.rechazadosAuto + t.rechazadosAdmin) / t.documentos : null;
  };

  const global = crear("global");
  for (const t of porTienda.values()) {
    t.diasADesembolso = mediana(dias.get(t.concesionarioId) ?? []);
    t.minutosAtencion = mediana(atencion.get(t.concesionarioId) ?? []);
    completar(t);
    for (const k of ["solicitudes", "desembolsadas", "aceptados", "enRevision", "rechazadosAuto", "aprobadosAdmin", "rechazadosAdmin"] as const) {
      global[k] += t[k];
    }
  }
  completar(global);
  global.diasADesembolso = mediana(todosDias);
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
    if (t.diasADesembolso !== null && global.diasADesembolso && t.desembolsadas >= MIN_DOCUMENTOS) {
      if (t.diasADesembolso >= 2 * global.diasADesembolso) {
        t.alertas.push(`tarda ${Math.round(t.diasADesembolso)} días en desembolsar (mediana)`);
      }
    }
  }

  const { concesionarioId: _c, nombre: _n, alertas: _a, ...globalSinId } = global;
  const tiendas = [...porTienda.values()].sort(
    (a, b) => b.alertas.length - a.alertas.length || b.documentos - a.documentos || b.solicitudes - a.solicitudes,
  );
  return { tiendas, global: globalSinId };
}
