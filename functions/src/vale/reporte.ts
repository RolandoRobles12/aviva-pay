import type { PayDeskVale } from "../types/vale";
import { valeVencido } from "./validar";

export type EstadoReporte = "vigente" | "utilizado" | "vencido" | "cancelado";

/**
 * El estado de un vale para efectos del reporte. `vencido` no es un
 * estado guardado —se deriva de la fecha— así que se calcula aquí, igual
 * que lo hace la caja al validar.
 */
export function estadoParaReporte(vale: PayDeskVale, ahora = Date.now()): EstadoReporte {
  if (vale.estado === "utilizado") return "utilizado";
  if (vale.estado === "cancelado") return "cancelado";
  return valeVencido(vale, ahora) ? "vencido" : "vigente";
}

export interface FilaTiendaReporte {
  concesionarioId: string;
  tienda: string;
  vigente: number;
  utilizado: number;
  vencido: number;
  cancelado: number;
  montoDispuesto: number;
  montoNuncaGastado: number;
}

/**
 * Las cuentas del reporte de vales, sin Firestore de por medio para que se
 * puedan probar. Ver `adminValeReporte` para qué significa cada cifra.
 */
export function calcularReporteVales(
  vales: PayDeskVale[],
  nombrePorTienda: Map<string, string>,
  ahora = Date.now(),
) {
  // Los códigos que alguna reemisión dejó atrás. `reemplazaA` vive en el
  // vale NUEVO y apunta al viejo, así que "a este lo reemplazaron" solo se
  // sabe mirando todos los vales, no el vale mismo.
  const reemplazados = new Set<string>();
  for (const vale of vales) {
    if (vale.reemplazaA) reemplazados.add(vale.reemplazaA);
  }

  const totales = { vigente: 0, utilizado: 0, vencido: 0, cancelado: 0 };
  let montoAutorizadoUtilizado = 0;
  let montoDispuesto = 0;
  let montoNuncaGastado = 0;
  // Entre los que murieron sin usarse, ¿el cliente llegó siquiera al
  // mostrador? Es el corte que cambia qué se hace al respecto: si casi
  // nadie llegó, el problema está antes de la tienda y se ataca con
  // recordatorios; si llegaron y no se completó, el problema está en la
  // caja. La expiración no tiene etapa propia en HubSpot, así que este
  // hecho es lo más cerca que se puede estar del motivo sin inventarlo.
  let muertosNuncaLeidos = 0;
  let muertosLeidosSinUsar = 0;

  const porTienda = new Map<string, FilaTiendaReporte>();

  for (const vale of vales) {
    const estado = estadoParaReporte(vale, ahora);
    totales[estado] += 1;

    const fila = porTienda.get(vale.concesionarioId) ?? {
      concesionarioId: vale.concesionarioId,
      tienda: nombrePorTienda.get(vale.concesionarioId) ?? vale.concesionarioId,
      vigente: 0,
      utilizado: 0,
      vencido: 0,
      cancelado: 0,
      montoDispuesto: 0,
      montoNuncaGastado: 0,
    };
    fila[estado] += 1;

    if (estado === "utilizado") {
      montoAutorizadoUtilizado += vale.montoAutorizado ?? 0;
      montoDispuesto += vale.montoDispuesto ?? 0;
      fila.montoDispuesto += vale.montoDispuesto ?? 0;
    }

    // Vencido o cancelado sin haberse usado: crédito liberado que nadie
    // ejerció. Un cancelado por reemisión no cuenta como perdido — lo
    // reemplazó otro vale, y ese otro ya aparece con su propio estado.
    if (
      estado === "vencido" ||
      (estado === "cancelado" && !reemplazados.has(vale.codigo))
    ) {
      montoNuncaGastado += vale.montoAutorizado ?? 0;
      fila.montoNuncaGastado += vale.montoAutorizado ?? 0;
      if (vale.lecturasTotal > 0) muertosLeidosSinUsar += 1;
      else muertosNuncaLeidos += 1;
    }

    porTienda.set(vale.concesionarioId, fila);
  }

  return {
    totales,
    sinUsar: {
      nuncaLeidos: muertosNuncaLeidos,
      leidosSinUsar: muertosLeidosSinUsar,
    },
    montos: {
      autorizadoDeUtilizados: montoAutorizadoUtilizado,
      dispuesto: montoDispuesto,
      /** Lo que se vendió por encima del crédito autorizado. */
      excedente: montoDispuesto - montoAutorizadoUtilizado,
      nuncaGastado: montoNuncaGastado,
    },
    porTienda: [...porTienda.values()].sort((a, b) =>
      a.tienda.localeCompare(b.tienda, "es"),
    ),
  };
}
