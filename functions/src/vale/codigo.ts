import { randomBytes, randomInt } from "node:crypto";

/**
 * Cuántos dígitos trae el código que el cliente presenta.
 *
 * Diez, en dos grupos de cinco, por dos restricciones que se cruzan:
 *
 * - **Tecleable.** Cuando la pistola falla o el cliente solo trae el
 *   número apuntado, alguien lo va a escribir a mano en el mostrador.
 * - **Par.** El código va impreso como Code 128 en subset C, que codifica
 *   los dígitos de dos en dos; un número impar obligaría a rellenar.
 *
 * No necesita ser un secreto criptográfico: validar un código exige una
 * sesión de tienda ya autenticada (ver `validarVale`), así que nadie
 * puede ir probando números sin ser antes una tienda dada de alta, y todo
 * intento fallido queda registrado con su tienda.
 */
const DIGITOS_CODIGO = 10;

/**
 * El token que va en la URL del vale (`/vale/:token`) sí es lo único que
 * protege esa página: el link llega por WhatsApp y la abre alguien sin
 * sesión. 32 hex = 128 bits, no enumerable.
 */
const BYTES_TOKEN = 16;

/** Un código de 10 dígitos, ceros a la izquierda incluidos — `randomInt` da una distribución uniforme, a diferencia de `Math.random()`. */
export function generarCodigo(): string {
  let codigo = "";
  for (let i = 0; i < DIGITOS_CODIGO; i += 1) {
    codigo += String(randomInt(0, 10));
  }
  return codigo;
}

export function generarToken(): string {
  return randomBytes(BYTES_TOKEN).toString("hex");
}

/** `4820739156` → `48207 39156`: como se imprime en el vale y como se espera tecleado. */
export function formatearCodigo(codigo: string): string {
  const mitad = Math.ceil(codigo.length / 2);
  return `${codigo.slice(0, mitad)} ${codigo.slice(mitad)}`;
}

/**
 * Deja un código tecleado en su forma canónica. La pistola de la caja
 * manda los dígitos pelones, pero una persona escribe espacios, guiones o
 * el número tal como viene impreso — todos son el mismo código.
 * Devuelve null si lo que queda no son exactamente los dígitos esperados,
 * que es el caso "revisa los 10 dígitos" de la caja.
 */
export function normalizarCodigo(raw: string): string | null {
  const soloDigitos = raw.replace(/\D/g, "");
  return soloDigitos.length === DIGITOS_CODIGO ? soloDigitos : null;
}
