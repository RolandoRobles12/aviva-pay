import type { LeccionId } from "../capacitacion/progreso";

/**
 * "¿Cómo se hace?" junto a una tarea: abre su lección en la versión
 * abierta de la capacitación (/ayuda), en otra pestaña, para que la
 * persona no pierda lo que ya llevaba capturado en el formulario.
 */
export function AyudaLink({ leccion, children = "¿Cómo se hace?" }: { leccion: LeccionId; children?: string }) {
  return (
    <a
      href={`/ayuda/${leccion}`}
      target="_blank"
      rel="noopener noreferrer"
      className="ayuda-link"
    >
      <span className="ayuda-link__icono" aria-hidden>
        ?
      </span>
      {children}
    </a>
  );
}
