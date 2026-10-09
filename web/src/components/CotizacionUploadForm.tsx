import { useState } from "react";
import { VerificacionAviso } from "./VerificacionAviso";
import { ArchivoLink } from "./ArchivoLink";
import type { Verificacion } from "../lib/uploads";
import { uploadCotizacion } from "../lib/uploads";
import { CurrencyInput } from "./CurrencyInput";
import type { FieldLabels } from "../types/admin";

/** "Nueva cotización" module (section 5.2) — also used to replace an already-uploaded cotización. */
export function CotizacionUploadForm({
  dealId,
  labels,
  reemplazo = false,
  onUploaded,
  onCancel,
  onUpload = uploadCotizacion,
}: {
  dealId: string;
  labels?: FieldLabels;
  /** Ya hay un documento: muestra el aviso de reemplazo y la liga al actual. */
  reemplazo?: boolean;
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
  const [aviso, setAviso] = useState<{ verificacion: Verificacion | null; enRevision: boolean } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona un archivo (PDF, imagen o XML).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { verificacion, enRevision } = await onUpload({ dealId, file, fechaEntregaAcordada, montoTotalCompra });
      if (enRevision || (verificacion && verificacion.estado !== "aprobado")) {
        setAviso({ verificacion: verificacion ?? null, enRevision: Boolean(enRevision) });
        return;
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la cotización");
    } finally {
      setSubmitting(false);
    }
  }

  if (aviso) {
    return (
      <VerificacionAviso
        verificacion={aviso.verificacion}
        enRevision={aviso.enRevision}
        onCerrar={onUploaded}
      />
    );
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <h3>{reemplazo ? "Reemplazar cotización" : "Nueva cotización"}</h3>

      {reemplazo && (
        <p className="callout callout--warn">
          Ya hay una cotización subida para este cliente.{" "}
          <ArchivoLink dealId={dealId} tipo="cotizacion">
            Ver archivo actual
          </ArchivoLink>
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
            : reemplazo
              ? "Reemplazar cotización"
              : "Guardar cotización"}
        </button>
      </div>
    </form>
  );
}
