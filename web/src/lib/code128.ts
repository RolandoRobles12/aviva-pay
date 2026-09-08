/**
 * Code 128, subset C — el código de barras impreso en el vale.
 *
 * Subset C porque codifica los dígitos de dos en dos: los 10 dígitos del
 * vale caben en 90 módulos, una barra angosta que se lee bien en el
 * ancho de un celular. Y Code 128 1D, no QR, porque es lo que leen las
 * pistolas láser que las tiendas ya tienen conectadas a la caja — una
 * pistola se comporta como teclado, así que escanear el vale es teclear
 * el número en el campo, sin integración de por medio.
 */

/**
 * Los 107 patrones del estándar, como anchos de barra/espacio
 * alternados. Cada patrón suma 11 módulos salvo el de stop, que suma 13.
 */
const PATRONES = `212222 222122 222221 121223 121322 131222 122213 122312 132212 221213
221312 231212 112232 122132 122231 113222 123122 123221 223211 221132
221231 213212 223112 312131 311222 321122 321221 312212 322112 322211
212123 212321 232121 111323 131123 131321 112313 132113 132311 211313
231113 231311 112133 112331 132131 113123 113321 133121 313121 211331
231131 213113 213311 213131 311123 311321 331121 312113 312311 332111
314111 221411 431111 111224 111422 121124 121421 141122 141221 112214
112412 122114 122411 142112 142211 241211 221114 413111 241112 134111
111242 121142 121241 114212 124112 124211 411212 421112 421211 212141
214121 412121 111143 111341 131141 114113 114311 411113 411311 113141
114131 311141 411131 211412 211214 211232 2331112`.split(/\s+/);

const START_C = 105;
const STOP = 106;

/** Un tramo del código: si es barra (o espacio) y cuántos módulos mide. */
export interface Modulo {
  barra: boolean;
  ancho: number;
}

/**
 * Convierte un número de dígitos pares en la secuencia de barras y
 * espacios que lo representa, con su dígito verificador.
 */
export function code128c(digitos: string): Modulo[] {
  if (!/^\d+$/.test(digitos) || digitos.length % 2 !== 0) {
    throw new Error("code128c: se esperaba un número de dígitos par");
  }

  const valores: number[] = [START_C];
  for (let i = 0; i < digitos.length; i += 2) {
    valores.push(Number(digitos.slice(i, i + 2)));
  }

  // Verificador: suma ponderada por la posición, módulo 103.
  let suma = valores[0];
  for (let i = 1; i < valores.length; i += 1) {
    suma += valores[i] * i;
  }
  valores.push(suma % 103, STOP);

  const modulos: Modulo[] = [];
  for (const valor of valores) {
    const patron = PATRONES[valor];
    for (let i = 0; i < patron.length; i += 1) {
      modulos.push({ barra: i % 2 === 0, ancho: Number(patron[i]) });
    }
  }
  return modulos;
}
