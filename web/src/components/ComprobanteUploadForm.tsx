import { useState } from "react";
import { uploadComprobante } from "../lib/uploads";

/** "Comprobante de entrega" module (section 5.3). */
export function ComprobanteUploadForm({
  dealId,
  onUploaded,
}: {
  dealId: string;
  onUploaded: () => void;
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
      await uploadComprobante({ dealId, file, fechaEntrega, firmaClienteConfirmada });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el comprobante");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <h3>Comprobante de entrega</h3>
      <label>
        Archivo (PDF o imagen)
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>
      <label>
        Fecha de entrega
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
        El cliente firmó el documento de entrega
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Subiendo..." : "Guardar comprobante"}
      </button>
    </form>
  );
}
