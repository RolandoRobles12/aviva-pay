/**
 * El catálogo de lo que se mide en el portal: versión del esquema, flujos
 * y sus pasos, y tipos de equipo. Sin dependencias a propósito.
 *
 * Hay dos copias idénticas: functions/src/uso/catalogo.ts (el servidor
 * descarta lo que no esté aquí) y web/src/lib/catalogoUso.ts (el portal
 * solo puede mandar lo que esté aquí: `paso()` no compila con un paso
 * inventado). web/test/analitica.test.ts revisa que coincidan.
 *
 * Al cambiar el esquema de eventos (no solo agregar un paso), sube
 * VERSION_ESQUEMA en las dos: cada lote guarda con qué versión llegó.
 */
export const VERSION_ESQUEMA = 1;

export const FLUJOS = ["cotizacion", "comprobante", "vale", "camara"] as const;
export type Flujo = (typeof FLUJOS)[number];

/**
 * - Documentos: abrir → archivo → enviar → aprobado | revision | rechazado | error; o cancelar.
 *   `manual` = pidió que una persona lo revise.
 * - Vale: captura (d = pistola | camara | teclado) → resultado (d = estado) → confirmado,
 *   o monto-invalido / confirmar-fallo.
 * - Cámara: abrir → leido, o sin-permiso / no-soportado / cerrar-sin-leer.
 */
export const PASOS = {
  cotizacion: ["abrir", "archivo", "enviar", "aprobado", "revision", "rechazado", "error", "cancelar", "manual"],
  comprobante: ["abrir", "archivo", "enviar", "aprobado", "revision", "rechazado", "error", "cancelar", "manual"],
  vale: ["captura", "resultado", "monto-invalido", "confirmado", "confirmar-fallo"],
  camara: ["abrir", "leido", "sin-permiso", "no-soportado", "cerrar-sin-leer"],
} as const satisfies Record<Flujo, readonly string[]>;

export type PasoDe<F extends Flujo> = (typeof PASOS)[F][number];

export const DISPOSITIVOS = ["celular", "tablet", "escritorio"] as const;
export type Dispositivo = (typeof DISPOSITIVOS)[number];
