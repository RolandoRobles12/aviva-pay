import type { PayDeskDeal } from "../types/deal";

/**
 * Lo que un vendedor externo puede ver de una solicitud: quién es el
 * cliente, cuándo se aprobó, por cuánto y qué etapas ya alcanzó. Nada más.
 *
 * Es una lista cerrada a propósito: el vendedor no lee `paydesk_deals`
 * (las reglas de Firestore solo dejan leer a `concesionarioIds`), así que
 * todo lo que ve pasa por aquí. Un campo nuevo en el deal no le llega
 * hasta que alguien lo agregue a esta lista. El único monto que va es el
 * aprobado (decisión del negocio: el vendedor lo necesita para vender).
 * Quedan fuera archivos y sus rutas, fechas y montos capturados por la
 * tienda (como el total de la cotización), lo dispuesto en caja,
 * revisiones con comentarios de Aviva, el vale y la verificación.
 *
 * Los estatus de cotización y comprobante sí van, pero solo como
 * "pendiente"/"completado": son etapas del avance, no los documentos.
 */
export const CAMPOS_VENDEDOR = [
  "dealId",
  "concesionarioId",
  "cliente",
  "fechaSolicitud",
  "montoAprobado",
  "estatusKyc",
  "cotizacionEstatus",
  "creditoLiberadoFecha",
  "disposicionCreditoFecha",
  "comprobanteEntregaEstatus",
  "desembolsoFecha",
  "etapasExtra",
] as const satisfies readonly (keyof PayDeskDeal)[];

export type DealVendedor = Pick<PayDeskDeal, (typeof CAMPOS_VENDEDOR)[number]>;

export function proyectarParaVendedor(deal: PayDeskDeal): DealVendedor {
  return {
    dealId: deal.dealId,
    concesionarioId: deal.concesionarioId,
    cliente: deal.cliente,
    fechaSolicitud: deal.fechaSolicitud,
    montoAprobado: deal.montoAprobado,
    estatusKyc: deal.estatusKyc,
    cotizacionEstatus: deal.cotizacionEstatus,
    creditoLiberadoFecha: deal.creditoLiberadoFecha,
    disposicionCreditoFecha: deal.disposicionCreditoFecha,
    comprobanteEntregaEstatus: deal.comprobanteEntregaEstatus,
    desembolsoFecha: deal.desembolsoFecha,
    etapasExtra: deal.etapasExtra ?? {},
  };
}

/**
 * Solo clientes aprobados que siguen vivos: un crédito cancelado o
 * expirado ya no tiene etapa que seguir, y al vendedor no le toca saber
 * por qué murió.
 */
export function clientesParaVendedor(deals: PayDeskDeal[]): DealVendedor[] {
  return deals.filter((d) => !d.cancelado).map(proyectarParaVendedor);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza una lista de correos del panel: minúsculas, sin vacíos ni repetidos. */
export function limpiarCorreos(lista: string[]): { correos: string[] } | { invalido: string } {
  const limpios = lista.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const invalido = limpios.find((e) => !EMAIL_RE.test(e));
  if (invalido) return { invalido };
  return { correos: [...new Set(limpios)] };
}

/** Correos que aparecen en las dos listas de una misma tienda. */
export function correosEnAmbas(usuarios: string[], vendedores: string[]): string[] {
  const enTienda = new Set(usuarios);
  return vendedores.filter((e) => enTienda.has(e));
}
