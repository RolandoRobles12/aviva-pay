import { z } from "zod";
import { DISPOSITIVOS, FLUJOS, PASOS, VERSION_ESQUEMA, type Dispositivo, type Flujo } from "./catalogo";

export { DISPOSITIVOS, FLUJOS, PASOS, VERSION_ESQUEMA, type Dispositivo, type Flujo };

/**
 * Lo que manda el portal (tienda y asesor) sobre cómo se usa: pantallas,
 * toques, errores, cortes de señal y los pasos de los tres trabajos que
 * importan en Paydesk — subir la cotización, subir el comprobante y
 * validar el código del cliente en caja.
 *
 * Los flujos y pasos válidos viven en ./catalogo.ts (con copia probada en
 * el portal); la forma de cada evento, aquí y en web/src/lib/analitica.ts.
 *
 * Nada de esto lleva datos personales: de un campo solo viaja cuál es,
 * nunca lo escrito; los toques fuera de un botón se nombran por zona
 * ("Sin botón · Tabla de clientes"), y los textos se recortan y pierden
 * sus números antes de salir del navegador. El servidor vuelve a recortar
 * por si acaso: es quien no puede confiar en lo que le llega.
 */

/** Un texto corto, sin números largos ni correos: lo que se guarda de etiquetas y mensajes. */
export function limpiarTexto(texto: string, max = 80): string {
  return texto
    .replace(/[^\s@]+@[^\s@]+/g, "[correo]")
    .replace(/\d{3,}/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const texto = (max: number) => z.string().max(400).transform((s) => limpiarTexto(s, max));
const num = z.number().finite();
/** Epoch ms del reloj del navegador; el servidor lo corrige con la diferencia de relojes. */
const en = num.min(0);

const Pantalla = z.object({ t: z.literal("pantalla"), p: texto(60), ms: num.min(0).max(10 * 60_000), en });
const Toque = z.object({
  t: z.literal("toque"),
  p: texto(60),
  /** Posición en la página (px) y ancho de la ventana, para el mapa de toques. */
  x: num,
  y: num,
  w: num.min(1),
  e: texto(60),
  /** Tocó algo que no es botón, liga ni campo. */
  sb: z.boolean().optional(),
  en,
});
const Frustracion = z.object({
  t: z.literal("frustracion"),
  p: texto(60),
  x: num,
  y: num,
  w: num.min(1),
  e: texto(60),
  /** Cuántos toques seguidos. */
  n: num.min(3).max(100),
  en,
});
const ErrorApp = z.object({ t: z.literal("error"), p: texto(60), m: texto(140), en });
const Senal = z.object({ t: z.literal("senal"), ms: num.min(0).max(7 * 86_400_000), en });
const Paso = z.object({
  t: z.literal("paso"),
  f: z.enum(FLUJOS),
  s: z.string().max(30),
  d: texto(80).optional(),
  p: texto(60),
  en,
});

export const EventoSchema = z.discriminatedUnion("t", [Pantalla, Toque, Frustracion, ErrorApp, Senal, Paso]);
export type Evento = z.infer<typeof EventoSchema>;

export const MAX_EVENTOS_LOTE = 500;

const ID = /^[A-Za-z0-9_-]{8,64}$/;

export const LoteSchema = z.object({
  /** Versión del esquema con la que se armó el lote (ausente = 1, la primera). */
  v: z.number().int().min(1).max(1000).optional(),
  /**
   * Id del lote, fijo aunque se reintente: si la respuesta se perdió pero
   * el servidor sí lo guardó, el reintento no lo guarda dos veces. Ausente
   * en el lote vacío que solo pregunta si se graba.
   */
  loteId: z.string().regex(ID).optional(),
  /** Una visita de una pestaña: se renueva tras 30 min sin uso. */
  sesionId: z.string().regex(ID),
  dispositivo: z.enum(DISPOSITIVOS),
  /** El reloj del navegador al mandar, para corregir los `en`. */
  ahora: en,
  eventos: z.array(z.unknown()).max(MAX_EVENTOS_LOTE),
});

/**
 * Valida cada evento por separado: uno raro (de una versión vieja del
 * portal, por ejemplo) se descarta sin tirar el lote entero.
 */
export function eventosValidos(crudos: unknown[]): Evento[] {
  const out: Evento[] = [];
  for (const c of crudos) {
    const r = EventoSchema.safeParse(c);
    if (!r.success) continue;
    if (r.data.t === "paso" && !(PASOS[r.data.f] as readonly string[]).includes(r.data.s)) continue;
    out.push(r.data);
  }
  return out;
}

/** Corrige los tiempos del navegador con la diferencia contra el reloj del servidor. */
export function corregirReloj(eventos: Evento[], ahoraCliente: number, ahoraServidor: number): Evento[] {
  const delta = ahoraServidor - ahoraCliente;
  // Un lote que estuvo guardado sin señal llega horas después: su `ahora`
  // es el del envío, así que el delta sigue siendo solo el desfase del reloj.
  return eventos.map((e) => ({ ...e, en: Math.max(0, Math.round(e.en + delta)) }));
}

/** Quién manda el lote: sale del token, nunca del cuerpo. */
export type Perfil = "tienda" | "asesor";

export function perfilDeClaims(token: Record<string, unknown> | undefined): {
  perfil: Perfil;
  tiendas: string[];
} | null {
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const tienda = lista(token?.concesionarioIds);
  const vendedor = lista(token?.vendedorIds);
  if (tienda.length > 0) return { perfil: "tienda", tiendas: [...new Set([...tienda, ...vendedor])] };
  if (vendedor.length > 0) return { perfil: "asesor", tiendas: vendedor };
  return null;
}
