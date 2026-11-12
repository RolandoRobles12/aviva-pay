/** Dígitos que trae el código de un vale. */
export const DIGITOS_CODIGO = 10;

/**
 * Lo que queda en el campo del código después de cada tecla: solo
 * números, máximo 10, con el espacio después del quinto (como viene
 * impreso en el vale). Una letra o un símbolo simplemente no entran.
 *
 * Sirve igual para el lector: manda los dígitos uno por uno y el campo
 * los va acomodando solo.
 */
export function limpiarCodigoTecleado(raw: string): string {
  const digitos = raw.replace(/\D/g, "").slice(0, DIGITOS_CODIGO);
  return digitos.length > 5 ? `${digitos.slice(0, 5)} ${digitos.slice(5)}` : digitos;
}
