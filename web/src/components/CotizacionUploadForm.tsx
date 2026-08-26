import { useState } from "react";
import { uploadCotizacion } from "../lib/uploads";
import { CurrencyInput } from "./CurrencyInput";
import type { FieldLabels } from "../types/admin";

/** "Nueva cotización" module (section 5.2) — also used to replace an already-uploaded cotización. */
export function CotizacionUploadForm({
  dealId,
  labels,
  existingUrl,
  onUploaded,
  onCancel,
  onUpload = uploadCotizacion,
}: {
  dealId: string;
  labels?: FieldLabels;
  /** Pass the current cotizacionUrl when this is a replace, not a first upload — shows a warning and a link to what's there today. */
  existingUrl?: string | null;
  onUploaded: () => void;
  onCancel: () => void;
  /** Defaults to the concesionario endpoint; the admin preview passes adminUploadCotizacion instead. */
  onUpload?: typeof uploadCotizacion;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fechaEntregaAcordada, setFechaEntregaAcordada] = useState("");
  const [montoTotalCompra, setMontoTotalCompra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo (PDF, imagen o XML).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onUpload({ dealId, file, fechaEntregaAcordada, montoTotalCompra });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la cotización");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <h3>{existingUrl ? "Reemplazar cotización" : "Nueva cotización"}</h3>

      {existingUrl && (
        <p className="callout callout--warn">
          Ya hay una cotización subida para este cliente.{" "}
          <a href={existingUrl} target="_blank" rel="noopener noreferrer">
            Ver archivo actual
          </a>
          . Subir un archivo nuevo la reemplazará.
        </p>
      )}

      <label className="upload-form__dropzone">
        <input
          type="file"
          accept=".pdf,.xml,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <span aria-hidden>⬆️</span>
        <strong>{file ? file.name : "Subir cotización"}</strong>
        <span className="upload-form__hint">
          PDF, imagen o XML · Haz clic o arrastra el archivo aquí
        </span>
      </label>

      <label>
        {labels?.cotizacionFechaEntregaAcordada ?? "Fecha de entrega acordada"}
        <input
          type="date"
          value={fechaEntregaAcordada}
          onChange={(e) => setFechaEntregaAcordada(e.target.value)}
          required
        />
      </label>
      <div className="upload-form__field">
        <label htmlFor="monto-total-compra">
          {labels?.cotizacionMontoTotalCompra ?? "Monto total de la compra"}
        </label>
        <CurrencyInput
          id="monto-total-compra"
          value={montoTotalCompra}
          onChange={setMontoTotalCompra}
          required
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="upload-form__actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" disabled={submitting}>
          {submitting
            ? "Subiendo..."
            : existingUrl
              ? "Reemplazar cotización"
              : "Guardar cotización"}
        </button>
      </div>
    </form>
  );
}
