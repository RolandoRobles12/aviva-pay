import { useState } from "react";
import { uploadComprobante } from "../lib/uploads";
import type { FieldLabels } from "../types/admin";

/** "Comprobante de entrega" module (section 5.3) — also used to replace an already-uploaded comprobante. */
export function ComprobanteUploadForm({
  dealId,
  labels,
  existingUrl,
  onUploaded,
  onCancel,
  onUpload = uploadComprobante,
}: {
  dealId: string;
  labels?: FieldLabels;
  /** Pass the current comprobanteUrl when this is a replace, not a first upload — shows a warning and a link to what's there today. */
  existingUrl?: string | null;
  onUploaded: () => void;
  onCancel: () => void;
  /** Defaults to the concesionario endpoint; the admin preview passes adminUploadComprobante instead. */
  onUpload?: typeof uploadComprobante;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [firmaClienteConfirmada, setFirmaClienteConfirmada] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo (PDF o imagen).");
      return;
    }
    if (!firmaClienteConfirmada) {
      setError("Debes confirmar que el cliente firmó el documento de entrega.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onUpload({ dealId, file, fechaEntrega, firmaClienteConfirmada });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el comprobante");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <h3>{existingUrl ? "Reemplazar comprobante de entrega" : "Comprobante de entrega"}</h3>

      {existingUrl && (
        <p className="callout callout--warn">
          Ya hay un comprobante subido para este cliente.{" "}
          <a href={existingUrl} target="_blank" rel="noopener noreferrer">
            Ver archivo actual
          </a>
          . Subir un archivo nuevo lo reemplazará.
        </p>
      )}

      <label className="upload-form__dropzone">
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <span aria-hidden>⬆️</span>
        <strong>{file ? file.name : "Subir comprobante de entrega firmado"}</strong>
        <span className="upload-form__hint">
          PDF o imagen · Haz clic o arrastra el archivo aquí
        </span>
      </label>

      <label>
        {labels?.comprobanteFechaEntrega ?? "Fecha de entrega"}
        <input
          type="date"
          value={fechaEntrega}
          onChange={(e) => setFechaEntrega(e.target.value)}
          required
        />
      </label>
      <label className="upload-form__checkbox">
        <input
          type="checkbox"
          checked={firmaClienteConfirmada}
          onChange={(e) => setFirmaClienteConfirmada(e.target.checked)}
        />
        {labels?.comprobanteFirmaClienteConfirmada ??
          "Confirma que el cliente firmó el documento de entrega"}
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="upload-form__actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" disabled={submitting}>
          {submitting
            ? "Subiendo..."
            : existingUrl
              ? "Reemplazar comprobante"
              : "Guardar comprobante"}
        </button>
      </div>
    </form>
  );
}
