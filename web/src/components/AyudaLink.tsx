import type { LeccionId } from "../capacitacion/progreso";

/**
 * "¿Cómo se hace?" junto a una tarea: abre su lección en la versión
 * abierta de la capacitación (/ayuda), en otra pestaña, para que la
 * persona no pierda lo que ya llevaba capturado en el formulario.
 */
export function AyudaLink({
  leccion,
  ancla,
  children = "¿Cómo se hace?",
}: {
  leccion: LeccionId;
  /** Sección de la lección a la que salta, p. ej. "practica". */
  ancla?: string;
  children?: string;
}) {
  return (
    <a
      href={`/ayuda/${leccion}${ancla ? `#${ancla}` : ""}`}
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
