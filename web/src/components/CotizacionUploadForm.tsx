import { useState } from "react";
import { uploadCotizacion } from "../lib/uploads";
import { CurrencyInput } from "./CurrencyInput";
import type { FieldLabels } from "../types/admin";

/** "Nueva cotización" module (section 5.2). */
export function CotizacionUploadForm({
  dealId,
  labels,
  onUploaded,
  onCancel,
}: {
  dealId: string;
  labels?: FieldLabels;
  onUploaded: () => void;
  onCancel: () => void;
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
      await uploadCotizacion({ dealId, file, fechaEntregaAcordada, montoTotalCompra });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la cotización");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <h3>Nueva cotización</h3>

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
          {submitting ? "Subiendo..." : "Guardar cotización"}
        </button>
      </div>
    </form>
  );
}
