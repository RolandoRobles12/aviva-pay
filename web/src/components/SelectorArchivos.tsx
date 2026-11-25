import { useState } from "react";
import { MAX_ARCHIVOS } from "../lib/imagenes";

function tamano(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Elegir el documento a subir, en uno o varios archivos: las dos caras de
 * un comprobante firmado o una cotización de varias hojas fotografiadas
 * una por una. Cada vez que se elige (o se arrastra) se agregan a la lista,
 * porque en el celular la cámara toma una foto a la vez. El servidor los
 * une en un solo PDF, en este orden.
 */
export function SelectorArchivos({
  archivos,
  onChange,
  accept,
  titulo,
  formatos,
  onElegido,
}: {
  archivos: File[];
  onChange: (archivos: File[]) => void;
  accept: string;
  /** Lo que dice la zona cuando todavía no hay nada, p. ej. "Subir cotización". */
  titulo: string;
  /** Qué formatos acepta, para la ayuda, p. ej. "PDF o fotos". */
  formatos: string;
  onElegido?: () => void;
}) {
  const [encima, setEncima] = useState(false);
  const lleno = archivos.length >= MAX_ARCHIVOS;

  function agregar(lista: FileList | null) {
    const nuevos = Array.from(lista ?? []);
    if (nuevos.length === 0) return;
    onElegido?.();
    onChange([...archivos, ...nuevos].slice(0, MAX_ARCHIVOS));
  }

  return (
    <div className="selector-archivos">
      {archivos.length > 0 && (
        <ol className="selector-archivos__lista">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="selector-archivos__item">
              <span className="selector-archivos__num" aria-hidden>
                {i + 1}
              </span>
              <span className="selector-archivos__nombre" data-privado>
                {f.name}
              </span>
              <span className="selector-archivos__peso">{tamano(f.size)}</span>
              <button
                type="button"
                className="selector-archivos__quitar"
                aria-label={`Quitar ${f.name}`}
                onClick={() => onChange(archivos.filter((_, j) => j !== i))}
              >
                Quitar
              </button>
            </li>
          ))}
        </ol>
      )}

      {!lleno && (
        <label
          className={`upload-form__dropzone${archivos.length > 0 ? " upload-form__dropzone--compacta" : ""}${
            encima ? " upload-form__dropzone--encima" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            agregar(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            multiple
            accept={accept}
            onChange={(e) => {
              agregar(e.target.files);
              // Para poder volver a elegir el mismo archivo después de quitarlo.
              e.target.value = "";
            }}
          />
          {archivos.length === 0 ? (
            <>
              <span aria-hidden>⬆️</span>
              <strong>{titulo}</strong>
              <span className="upload-form__hint">
                {formatos} · Haz clic o arrastra aquí. Si son varias hojas o fotos, puedes subir
                hasta {MAX_ARCHIVOS}.
              </span>
            </>
          ) : (
            <strong>+ Agregar otra hoja o foto</strong>
          )}
        </label>
      )}
      {archivos.length > 1 && (
        <p className="upload-form__hint">
          Se juntan en un solo documento, en este orden.
          {lleno ? ` Ya son ${MAX_ARCHIVOS}, el máximo.` : ""}
        </p>
      )}
    </div>
  );
}
