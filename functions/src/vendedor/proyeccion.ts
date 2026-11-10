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

interface TiendaConCorreos {
  concesionarioId: string;
  nombre: string;
  usuarios?: string[];
  vendedores?: string[];
}

/**
 * El vendedor es personal de la tienda cuyo trabajo es vender: da
 * seguimiento a sus clientes, sin labores administrativas (documentos,
 * caja). Cada persona tiene un solo perfil en todo Paydesk —acceso
 * completo o vendedor—, no uno distinto por tienda: así nadie termina
 * con acceso completo en una tienda y de vendedor en otra.
 *
 * Revisa las listas que quedarían en la tienda que se está guardando
 * contra las de todas las demás, y devuelve un mensaje por correo en
 * conflicto (vacío si no hay).
 */
export function conflictosDeRol(
  concesionarioId: string,
  usuarios: string[],
  vendedores: string[],
  todas: TiendaConCorreos[],
): string[] {
  const mensajes: string[] = [];
  const enUsuarios = new Set(usuarios);
  for (const email of vendedores) {
    if (enUsuarios.has(email)) {
      mensajes.push(`${email} está en las dos listas de esta tienda. Déjalo en una sola. Cada persona tiene un solo perfil: acceso completo o asesor de ventas.`);
    }
  }
  const otras = todas.filter((t) => t.concesionarioId !== concesionarioId);
  for (const email of vendedores) {
    const t = otras.find((o) => (o.usuarios ?? []).includes(email));
    if (t) {
      mensajes.push(
        `${email} ya tiene acceso completo en ${t.nombre}. Cada persona tiene un solo perfil: acceso completo o asesor de ventas.`,
      );
    }
  }
  for (const email of usuarios) {
    const t = otras.find((o) => (o.vendedores ?? []).includes(email));
    if (t) {
      mensajes.push(
        `${email} es asesor de ventas en ${t.nombre}. Cada persona tiene un solo perfil: acceso completo o asesor de ventas.`,
      );
    }
  }
  return mensajes;
}
