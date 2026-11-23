import { adminGetFragmentosCallable, type FragmentoGrabacion } from "./firebase";
import { base64ATexto } from "./comprimir";

/**
 * Lo que el panel necesita para reconstruir una grabación: bajar sus
 * pedazos, descomprimirlos y juntarlos en orden. rrweb se carga aparte,
 * con `import()`, solo en las pantallas que reproducen.
 */

export interface EventoRrweb {
  type: number;
  timestamp: number;
  data: unknown;
}

export async function cargarPedazos(
  sesionId: string,
  ns: number[],
  onAvance?: (listos: number, total: number) => void,
): Promise<{ eventos: EventoRrweb[]; fragmentos: Omit<FragmentoGrabacion, "datos">[] }> {
  const eventos: EventoRrweb[] = [];
  const fragmentos: Omit<FragmentoGrabacion, "datos">[] = [];
  for (let i = 0; i < ns.length; i += 8) {
    const { data } = await adminGetFragmentosCallable({ sesionId, ns: ns.slice(i, i + 8) });
    for (const f of data.fragmentos.sort((a, b) => a.n - b.n)) {
      const { datos, ...meta } = f;
      try {
        eventos.push(...(JSON.parse(await base64ATexto(datos)) as EventoRrweb[]));
        fragmentos.push(meta);
      } catch {
        // Un pedazo dañado se salta: el siguiente empieza con su propia foto completa.
      }
    }
    onAvance?.(Math.min(ns.length, i + 8), ns.length);
  }
  eventos.sort((a, b) => a.timestamp - b.timestamp);
  return { eventos, fragmentos };
}

/** Estilos que el reproductor de rrweb necesita (cursor, clics). */
export async function cargarRrweb() {
  const [rrweb] = await Promise.all([import("rrweb"), import("rrweb/dist/style.css")]);
  return rrweb;
}
