/**
 * gzip ↔ base64 con lo que trae el navegador (CompressionStream), para
 * los pedazos de las grabaciones: el portal los comprime antes de subirlos
 * y el panel los descomprime para reproducirlos.
 */

export async function gzipABase64(texto: string): Promise<{ base64: string; bytes: number }> {
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
  const datos = new Uint8Array(await new Response(stream).arrayBuffer());
  return { base64: bytesABase64(datos), bytes: datos.length };
}

export async function base64ATexto(base64: string): Promise<string> {
  const stream = new Blob([base64ABytes(base64)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export function bytesABase64(datos: Uint8Array): string {
  let binario = "";
  // En trozos: String.fromCharCode con un arreglo enorme revienta la pila.
  for (let i = 0; i < datos.length; i += 0x8000) {
    binario += String.fromCharCode(...datos.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export function base64ABytes(base64: string): Uint8Array<ArrayBuffer> {
  const binario = atob(base64);
  const datos = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) datos[i] = binario.charCodeAt(i);
  return datos;
}
