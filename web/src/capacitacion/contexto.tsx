import { createContext, useContext } from "react";
import type { FieldLabels } from "../types/admin";
import type { OrigenDisposicion } from "../lib/firebase";

/**
 * Lo que una lección necesita saber de quien la está tomando. La misma
 * capacitación vive en dos lugares:
 *
 * - `tienda` (/solicitudes/aprende): con sesión. Usa los nombres de
 *   columna que Aviva configuró y guarda el avance en el servidor.
 * - `publico` (/ayuda): sin sesión, para mandarle la liga a una tienda
 *   antes de darle acceso o para abrirla desde un formulario sin perder
 *   lo capturado. Usa los nombres por defecto y no guarda nada.
 */
export interface CapacitacionContexto {
  modo: "tienda" | "publico";
  /** Ruta base de las lecciones: "/solicitudes/aprende" o "/ayuda". */
  base: string;
  completadas: string[];
  /** Anota una lección como pasada. En modo público no hace nada. */
  marcarCompletada: (id: string) => Promise<void>;
  labels: FieldLabels;
  origenDisposicion: OrigenDisposicion;
}

export const ETIQUETAS_DEFAULT: FieldLabels = {
  cliente: "Cliente",
  fechaSolicitud: "Fecha de solicitud",
  montoAprobado: "Monto aprobado",
  estatusKyc: "Estatus de KYC",
  cotizacionEstatus: "Cotización",
  creditoLiberadoFecha: "Crédito liberado",
  disposicionCreditoFecha: "Disposición del crédito",
  comprobanteEntregaEstatus: "Comprobante de entrega",
  desembolsoFecha: "Desembolso del crédito",
  cotizacionFechaEntregaAcordada: "Fecha de entrega acordada",
  cotizacionMontoTotalCompra: "Monto total de la compra",
  comprobanteFechaEntrega: "Fecha de entrega",
};

const Contexto = createContext<CapacitacionContexto | null>(null);

export const CapacitacionProvider = Contexto.Provider;

export function useCapacitacion(): CapacitacionContexto {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useCapacitacion fuera de CapacitacionProvider");
  return ctx;
}

/** Nombre de columna como lo ve esta tienda, con el de fábrica si Aviva no lo cambió. */
export function useEtiqueta() {
  const { labels } = useCapacitacion();
  return (campo: string) => labels[campo] || ETIQUETAS_DEFAULT[campo] || campo;
}
