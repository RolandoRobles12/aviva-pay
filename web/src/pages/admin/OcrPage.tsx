import { useEffect, useState } from "react";
import {
  adminGetOcrCallable,
  adminProbarOcrCallable,
  adminSetOcrCallable,
  type ModeloOcr,
  type ModoOcr,
  type OcrConfig,
} from "../../lib/firebase";

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
      "Claude revisa cada cotización y comprobante y el resultado se guarda en la solicitud, pero nunca se rechaza una subida. Úsalo unos días para ver cuántos documentos legítimos marcaría antes de bloquear.",
  },
  {
    valor: "bloquear",
    titulo: "Bloquear",
    descripcion:
      "Se rechaza el documento que no se pueda leer, no sea del tipo correcto, repita un archivo ya subido en otra solicitud o (cotización) cuyo total no coincida con el capturado. Firma, fecha, nombre del cliente y señales de alteración solo lo marcan para revisión. Los administradores no son rechazados al reemplazar documentos.",
  },
];

const MODELOS: { valor: ModeloOcr; titulo: string; descripcion: string }[] = [
  {
    valor: "sonnet",
    titulo: "Claude Sonnet",
    descripcion: "El de uso normal: lee mejor fotos difíciles y detecta mejor alteraciones.",
  },
  {
    valor: "haiku",
    titulo: "Claude Haiku",
    descripcion:
      "Más barato y rápido. Alternativa si Sonnet da errores; puede pasar por alto detalles finos.",
  },
];

/**
 * Cómo se verifica con Claude lo que suben las tiendas. Claude lee el
 * documento (functions/src/ocr/analizar.ts) y las reglas que deciden viven
 * en functions/src/ocr/validate.ts; aquí solo se elige qué tan estricto es.
 */
export function OcrPage() {
  const [config, setConfig] = useState<OcrConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [probando, setProbando] = useState(false);

  async function probar() {
    setProbando(true);
    setPrueba(null);
    try {
      setPrueba((await adminProbarOcrCallable()).data);
    } catch (err) {
      setPrueba({ ok: false, mensaje: err instanceof Error ? err.message : "No se pudo probar." });
    } finally {
      setProbando(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setConfig((await adminGetOcrCallable()).data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      await adminSetOcrCallable(config);
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !config) return <p className="page-message page-message--error">{error}</p>;
  if (!config) return <p className="page-message">Cargando configuración...</p>;

  return (
    <section>
      <h1 className="admin-title">Verificación de documentos</h1>
      <p className="admin-subtitle">
        Al subir una cotización o un comprobante de entrega, Claude lee el
        documento y reporta qué es, a quién va dirigido, sus importes, fechas,
        si trae firma y si muestra señales de alteración. Paydesk lo contrasta
        con la solicitud y con los archivos ya subidos. El resultado, con lo
        que Claude leyó, queda guardado en la solicitud.
      </p>

      <div className="callout callout--warn">
        Si Claude no responde o el formato no se puede analizar (por ejemplo,
        una foto HEIC o mayor a 5 MB), la subida continúa y el documento queda
        como no verificado: una caída no frena a las tiendas. Un archivo
        repetido de otra solicitud se rechaza de todos modos.
        Los cambios aplican en pocos minutos.
      </div>

      {config.modo === "observar" && (
        <div className="callout callout--warn">
          <strong>En modo Observar no se rechaza ningún documento.</strong> Cada
          archivo se analiza y el resultado se ve en la vista de cada tienda
          (Tiendas → ver como tienda), pero la subida siempre se acepta. Para
          que se rechacen los documentos inválidos, elige <strong>Bloquear</strong>.
        </div>
      )}

      <div className="stage-date-list__actions">
        <button type="button" className="link-button" onClick={probar} disabled={probando}>
          {probando ? "Probando..." : "Probar conexión con Claude"}
        </button>
        {prueba && (
          <span className={prueba.ok ? "form-success" : "form-error"}>{prueba.mensaje}</span>
        )}
      </div>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {MODOS.map((m) => (
          <label className="dictionary-row dictionary-row--stack" key={m.valor}>
            <span>
              <input
                type="radio"
                name="modo"
                checked={config.modo === m.valor}
                onChange={() => setConfig({ ...config, modo: m.valor })}
              />{" "}
              <strong>{m.titulo}</strong>
            </span>
            <span className="dictionary-row__key">{m.descripcion}</span>
          </label>
        ))}

        <h2 className="admin-title">Modelo</h2>
        {MODELOS.map((m) => (
          <label className="dictionary-row dictionary-row--stack" key={m.valor}>
            <span>
              <input
                type="radio"
                name="modelo"
                checked={config.modelo === m.valor}
                onChange={() => setConfig({ ...config, modelo: m.valor })}
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
