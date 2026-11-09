import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Windows y macOS no distinguen mayúsculas en los nombres de archivo:
 * `tiendaPractica.ts` y `TiendaPractica.tsx` se vuelven el mismo módulo
 * "./TiendaPractica" y el build falla allá, aunque en Linux (CI) pase.
 * Esta prueba lo detecta en cualquier sistema.
 */
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

describe("nombres de archivo", () => {
  it("no hay dos módulos que solo se distingan por mayúsculas", () => {
    const raiz = join(__dirname, "..", "src");
    const porModulo = new Map<string, string[]>();
    for (const ruta of archivos(raiz)) {
      // Sin extensión: así es como se importan ("./TiendaPractica").
      const modulo = relative(raiz, ruta).replace(/\.(tsx?|css)$/, "").toLowerCase();
      porModulo.set(modulo, [...(porModulo.get(modulo) ?? []), relative(raiz, ruta)]);
    }
    const choques = [...porModulo.values()].filter((l) => l.length > 1);
    expect(choques).toEqual([]);
  });
});
