/**
 * La regla del monto de la venta al confirmar una disposición. Es la misma
 * que aplica `confirmarDisposicion` en el servidor; aquí está para que la
 * caja (y el simulador) avisen antes de mandar nada, sin perder la
 * pantalla del vale.
 *
 * El monto es el **total de la venta**, no lo que cubre el crédito:
 * - Menor al crédito autorizado, no: el crédito se usa completo.
 * - Mayor, sí: el cliente se lleva más material del que cubre su crédito.
 *
 * Devuelve el mensaje tal cual lo ve la caja, o null si se puede confirmar.
 */
export function errorMontoVenta(monto: number, autorizado: number | null): string | null {
  if (!Number.isFinite(monto) || monto <= 0) {
    return "Captura el monto de la venta para poder confirmar.";
  }
  if (autorizado !== null && monto < autorizado) {
    return "El monto de la venta no puede ser menor al crédito autorizado.";
  }
  return null;
}
