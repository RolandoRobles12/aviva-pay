import { useEffect, useState } from "react";
import { adminGetOcrCallable, adminSetOcrCallable, type ModoOcr } from "../../lib/firebase";

const MODOS: { valor: ModoOcr; titulo: string; descripcion: string }[] = [
  {
    valor: "apagado",
    titulo: "Apagado",
    descripcion: "No se lee ningún documento.",
  },
  {
    valor: "observar",
    titulo: "Observar",
    descripcion:
      "Se lee cada cotización y comprobante y se guarda el resultado en la solicitud, pero nunca se rechaza una subida. Úsalo unos días para ver cuántos documentos legítimos marcaría antes de bloquear.",
  },
  {
    valor: "bloquear",
    titulo: "Bloquear",
    descripcion:
      "Se rechaza el documento que no se pueda leer, repita un archivo ya subido en otra solicitud o (cotización) no contenga el monto capturado. Los administradores no son rechazados al reemplazar documentos.",
  },
];

/**
 * Cómo se valida por OCR lo que suben las tiendas. Las reglas en sí viven
 * en functions/src/ocr/validate.ts; aquí solo se elige qué tan estricto es.
 */
export function OcrPage() {
  const [modo, setModo] = useState<ModoOcr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setModo((await adminGetOcrCallable()).data.modo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modo) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      await adminSetOcrCallable({ modo });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !modo) return <p className="page-message page-message--error">{error}</p>;
  if (!modo) return <p className="page-message">Cargando configuración...</p>;

  return (
    <section>
      <h1 className="admin-title">Validación OCR</h1>
      <p className="admin-subtitle">
        Al subir una cotización o un comprobante de entrega se lee el documento
        y se contrasta con lo que Paydesk sabe de la solicitud: que sea legible,
        que no sea el mismo archivo de otra solicitud, que el monto o la fecha
        capturados aparezcan en él y que mencione al cliente. El resultado queda
        guardado en la solicitud.
      </p>

      <div className="callout callout--warn">
        Si el servicio de OCR no responde, la subida continúa y el documento
        queda marcado como no verificado: una caída no frena a las tiendas.
        Los cambios aplican en pocos minutos.
      </div>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {MODOS.map((m) => (
          <label className="dictionary-row dictionary-row--stack" key={m.valor}>
            <span>
              <input
                type="radio"
                name="modo"
                checked={modo === m.valor}
                onChange={() => setModo(m.valor)}
              />{" "}
              <strong>{m.titulo}</strong>
            </span>
            <span className="dictionary-row__key">{m.descripcion}</span>
          </label>
        ))}

        {error && <p className="form-error">{error}</p>}
        {guardado && <p className="form-success">Configuración guardada.</p>}

        <div className="dictionary-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
