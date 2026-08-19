import { useState } from "react";
import { uploadCotizacion } from "../lib/uploads";

/** "Nueva cotización" module (section 5.2). */
export function CotizacionUploadForm({
  dealId,
  onUploaded,
}: {
  dealId: string;
  onUploaded: () => void;
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
      <label>
        Archivo (PDF, imagen o XML)
        <input
          type="file"
          accept=".pdf,.xml,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>
      <label>
        Fecha de entrega acordada
        <input
          type="date"
          value={fechaEntregaAcordada}
          onChange={(e) => setFechaEntregaAcordada(e.target.value)}
          required
        />
      </label>
      <label>
        Monto total de la compra
        <input
          type="number"
          min="0"
          step="0.01"
          value={montoTotalCompra}
          onChange={(e) => setMontoTotalCompra(e.target.value)}
          required
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Subiendo..." : "Guardar cotización"}
      </button>
    </form>
  );
}
