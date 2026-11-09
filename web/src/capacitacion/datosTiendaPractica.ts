import type { PayDeskDeal } from "../types/deal";
import type { RolloutMap } from "../lib/dealScope";

/**
 * La tienda de práctica: clientes inventados sobre los que la persona hace
 * sus tareas con la lista y los formularios reales (DealsTable,
 * DealFilters, CotizacionUploadForm, ComprobanteUploadForm). Nada de esto
 * toca el servidor: las subidas las resuelve `subirPractica`, aquí, y el
 * archivo que elijan nunca sale del navegador.
 *
 * Todo es puro para poder probarlo; el componente (TiendaPractica.tsx)
 * solo guarda el estado y pinta.
 */

export const TIENDA_PRACTICA = "practica";

export type ClientePractica =
  | "ana"
  | "luis"
  | "rosa"
  | "pedro"
  | "carmen"
  | "lucia"
  | "jorge";

const DIA_MS = 86_400_000;

function iso(d: Date): string {
  return d.toISOString();
}

/** Un día del mes pasado, a mediodía, para que caiga ahí en cualquier zona horaria. */
function mesPasado(hoy: Date): Date {
  return new Date(hoy.getFullYear(), hoy.getMonth() - 1, 12, 12);
}

function base(id: ClientePractica, cliente: string, fecha: Date, monto: number): PayDeskDeal {
  return {
    dealId: id,
    concesionarioId: TIENDA_PRACTICA,
    kiosco: null,
    cliente,
    fechaSolicitud: iso(fecha),
    montoAprobado: monto,
    estatusKyc: iso(fecha),
    cotizacionEstatus: "pendiente",
    cotizacionUrl: null,
    cotizacionFechaEntregaAcordada: null,
    cotizacionMontoTotalCompra: null,
    creditoLiberadoFecha: null,
    disposicionCreditoFecha: null,
    comprobanteEntregaEstatus: "pendiente",
    comprobanteUrl: null,
    comprobanteFechaEntrega: null,
    comprobanteFirmaClienteConfirmada: null,
    desembolsoFecha: null,
  };
}

/**
 * Siete clientes, uno por situación que la tienda tiene que reconocer:
 * Ana y Luis esperan un documento suyo, Rosa tiene un archivo que no se
 * va a aceptar, Pedro es del mes pasado (escondido por el filtro "Este
 * mes") con un documento en revisión, Carmen ya terminó, Lucía va
 * avanzando sin pedir nada, y Jorge es anterior a que la tienda usara
 * Paydesk.
 */
export function dealsIniciales(hoy = new Date()): PayDeskDeal[] {
  const ayer = new Date(hoy.getTime() - DIA_MS);
  const pasado = mesPasado(hoy);
  const antiguo = new Date(hoy.getFullYear(), hoy.getMonth() - 6, 15, 12);
  const listo = (d: PayDeskDeal, campos: Partial<PayDeskDeal>): PayDeskDeal => ({ ...d, ...campos });

  return [
    base("ana", "Ana Martínez", hoy, 20_000),
    listo(base("luis", "Luis Ramírez", hoy, 25_000), {
      cotizacionEstatus: "completado",
      cotizacionFechaEntregaAcordada: iso(hoy),
      creditoLiberadoFecha: iso(hoy),
      disposicionCreditoFecha: iso(hoy),
    }),
    base("rosa", "Rosa Díaz", hoy, 15_000),
    listo(base("pedro", "Pedro Sánchez", pasado, 18_000), {
      cotizacionRevision: {
        estado: "pendiente",
        fileName: "cotizacion-pedro.pdf",
        capturado: {},
        subidoEn: iso(pasado),
      },
    }),
    listo(base("carmen", "Carmen Ortiz", hoy, 30_000), {
      cotizacionEstatus: "completado",
      cotizacionFechaEntregaAcordada: iso(hoy),
      creditoLiberadoFecha: iso(hoy),
      disposicionCreditoFecha: iso(hoy),
      comprobanteEntregaEstatus: "completado",
      comprobanteFechaEntrega: iso(hoy),
      desembolsoFecha: iso(hoy),
    }),
    listo(base("lucia", "Lucía Fernández", ayer, 12_000), {
      cotizacionEstatus: "completado",
      cotizacionFechaEntregaAcordada: iso(hoy),
    }),
    listo(base("jorge", "Jorge Medina", antiguo, 22_000), {
      cotizacionEstatus: "completado",
      creditoLiberadoFecha: iso(antiguo),
    }),
  ];
}

/** La tienda "empezó a usar Paydesk" hace cuatro meses: Jorge queda como Anterior. */
export function rolloutPractica(hoy = new Date()): RolloutMap {
  const corte = new Date(hoy.getFullYear(), hoy.getMonth() - 4, 1, 12);
  return { [TIENDA_PRACTICA]: corte.toISOString().slice(0, 10) };
}

/** Los mismos textos que manda el servidor (functions/src/ocr/validarDocumento.ts). */
export function mensajeRechazo(tipo: "cotizacion" | "comprobante"): string {
  const [doc, como] =
    tipo === "cotizacion"
      ? ["la cotización", "correcta, completa y legible"]
      : ["el comprobante de entrega", "correcto, completo y legible"];
  return (
    `Hubo un problema con el archivo y no pudimos aceptarlo. ` +
    `Revisa que sea ${doc} ${como}, y vuelve a subirlo.`
  );
}

/** Copia de RECHAZOS_PARA_REVISION_MANUAL (lib/uploads.ts). */
const RECHAZOS_PARA_MANUAL = 2;

/** Quién no pasa la verificación en la práctica, para enseñar el rechazo y la verificación manual. */
export const CLIENTE_RECHAZADO: ClientePractica = "rosa";

export interface SubidaPractica {
  tipo: "cotizacion" | "comprobante";
  dealId: string;
  /** Cotización: fecha de entrega acordada. Comprobante: fecha de entrega. */
  fecha: string;
  montoTotalCompra?: string;
  solicitudManual?: boolean;
}

export type ResultadoSubida =
  | { ok: true; enRevision: boolean; reemplazo: boolean }
  | { ok: false; mensaje: string; revisionManualDisponible: boolean };

/**
 * Lo que respondería el servidor a una subida de práctica, y cómo queda
 * la lista después. Se comporta como el real en lo que la tienda ve:
 * aceptado → paso completado; rechazado → no se guarda y cuenta para la
 * verificación manual; verificación manual → "En revisión".
 */
export function subirPractica(
  deals: PayDeskDeal[],
  s: SubidaPractica,
  ahora = new Date(),
): { deals: PayDeskDeal[]; resultado: ResultadoSubida } {
  const deal = deals.find((d) => d.dealId === s.dealId);
  if (!deal) {
    return {
      deals,
      resultado: { ok: false, mensaje: "No encontramos esta solicitud.", revisionManualDisponible: false },
    };
  }
  const esCot = s.tipo === "cotizacion";
  const rechazosPrevios = (esCot ? deal.cotizacionRechazosAuto : deal.comprobanteRechazosAuto) ?? 0;
  const actualizar = (campos: Partial<PayDeskDeal>) =>
    deals.map((d) => (d.dealId === s.dealId ? { ...d, ...campos } : d));

  if (s.dealId === CLIENTE_RECHAZADO && s.solicitudManual) {
    const revision = {
      estado: "pendiente" as const,
      fileName: "documento",
      capturado: {},
      subidoEn: ahora.toISOString(),
      solicitudManual: true,
    };
    return {
      deals: actualizar(
        esCot
          ? { cotizacionRevision: revision, cotizacionRechazosAuto: 0 }
          : { comprobanteRevision: revision, comprobanteRechazosAuto: 0 },
      ),
      resultado: { ok: true, enRevision: true, reemplazo: false },
    };
  }

  if (s.dealId === CLIENTE_RECHAZADO) {
    const rechazos = rechazosPrevios + 1;
    return {
      deals: actualizar(esCot ? { cotizacionRechazosAuto: rechazos } : { comprobanteRechazosAuto: rechazos }),
      resultado: {
        ok: false,
        mensaje: mensajeRechazo(s.tipo),
        revisionManualDisponible: rechazos >= RECHAZOS_PARA_MANUAL,
      },
    };
  }

  const reemplazo = (esCot ? deal.cotizacionEstatus : deal.comprobanteEntregaEstatus) === "completado";
  return {
    deals: actualizar(
      esCot
        ? {
            cotizacionEstatus: "completado",
            cotizacionFechaEntregaAcordada: s.fecha,
            cotizacionMontoTotalCompra: Number(s.montoTotalCompra) || null,
            cotizacionRevision: null,
            cotizacionRechazosAuto: 0,
          }
        : {
            comprobanteEntregaEstatus: "completado",
            comprobanteFechaEntrega: s.fecha,
            comprobanteFirmaClienteConfirmada: true,
            comprobanteRevision: null,
            comprobanteRechazosAuto: 0,
          },
    ),
    resultado: { ok: true, enRevision: false, reemplazo },
  };
}
