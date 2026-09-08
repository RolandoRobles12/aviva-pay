import type { PayDeskVale, ValeResultadoLectura } from "../types/vale";

/**
 * Lo que la caja recibe al validar un código.
 *
 * `otra-tienda` a propósito no trae nada del vale — ni el cliente, ni el
 * monto, ni de qué tienda es. Si lo dijera, cualquier tienda podría ir
 * tecleando códigos y mapear clientes y montos de la competencia. Es la
 * misma regla que ya siguen los endpoints de subida, donde un deal
 * inexistente y un deal ajeno responden idéntico (ver
 * http/uploadCotizacion.ts).
 */
export type ResultadoValidacion =
  | {
      estado: "ok";
      codigo: string;
      cliente: string | null;
      montoAutorizado: number | null;
      emitidoEn: string | null;
      venceEn: string;
      /** Cuántas veces se leyó ANTES de esta lectura: 2 aquí es "ya circuló". */
      lecturasPrevias: number;
      ultimaLecturaEn: string | null;
    }
  | { estado: "no-existe" }
  | { estado: "otra-tienda" }
  | { estado: "ya-utilizado"; consumidoEn: string | null; montoDispuesto: number | null }
  | { estado: "vencido"; venceEn: string; emitidoEn: string | null }
  | { estado: "cancelado" };

export function valeVencido(vale: PayDeskVale, ahora = Date.now()): boolean {
  return Date.parse(vale.venceEn) <= ahora;
}

/**
 * Decide el estado de un vale para la tienda que lo está leyendo.
 *
 * El orden de las comprobaciones importa: la pertenencia se revisa
 * ANTES que el consumo o el vencimiento, porque a una tienda ajena no se
 * le puede confirmar siquiera que el código existe — decirle "ese vale ya
 * se usó" ya sería filtrar que es real.
 */
export function evaluarVale(
  vale: PayDeskVale | null,
  concesionarioIds: string[],
  ahora = Date.now(),
): ResultadoValidacion {
  if (!vale) return { estado: "no-existe" };

  if (!concesionarioIds.includes(vale.concesionarioId)) {
    return { estado: "otra-tienda" };
  }

  if (vale.estado === "utilizado") {
    return {
      estado: "ya-utilizado",
      consumidoEn: vale.consumidoEn?.toDate().toISOString() ?? null,
      montoDispuesto: vale.montoDispuesto,
    };
  }

  if (vale.estado === "cancelado") return { estado: "cancelado" };

  if (valeVencido(vale, ahora)) {
    return {
      estado: "vencido",
      venceEn: vale.venceEn,
      emitidoEn: vale.emitidoEn?.toDate().toISOString() ?? null,
    };
  }

  return {
    estado: "ok",
    codigo: vale.codigo,
    cliente: vale.cliente,
    montoAutorizado: vale.montoAutorizado,
    emitidoEn: vale.emitidoEn?.toDate().toISOString() ?? null,
    venceEn: vale.venceEn,
    lecturasPrevias: vale.lecturasTotal,
    ultimaLecturaEn: vale.ultimaLecturaEn?.toDate().toISOString() ?? null,
  };
}

/** El estado de la validación, traducido a lo que se guarda en la bitácora. */
export function resultadoParaBitacora(
  resultado: ResultadoValidacion,
): ValeResultadoLectura {
  switch (resultado.estado) {
    case "ok":
      return "ok";
    case "ya-utilizado":
      return "ya-utilizado";
    case "otra-tienda":
      return "otra-tienda";
    case "vencido":
      return "vencido";
    case "cancelado":
      return "cancelado";
    case "no-existe":
      // No hay vale al que colgarle una lectura: se registra aparte, como
      // intento fallido (ver registrarIntentoFallido).
      throw new Error("resultadoParaBitacora: 'no-existe' no se registra en el vale");
  }
}
