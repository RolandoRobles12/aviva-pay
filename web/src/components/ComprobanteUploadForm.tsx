import { useState } from "react";
import { VerificacionAviso } from "./VerificacionAviso";
import { ArchivoLink } from "./ArchivoLink";
import type { Verificacion } from "../lib/uploads";
import { uploadComprobante } from "../lib/uploads";
import type { FieldLabels } from "../types/admin";

/** "Comprobante de entrega" module (section 5.3) — also used to replace an already-uploaded comprobante. */
export function ComprobanteUploadForm({
  dealId,
  labels,
  reemplazo = false,
  onUploaded,
  onCancel,
  onUpload = uploadComprobante,
}: {
  dealId: string;
  labels?: FieldLabels;
  /** Ya hay un documento: muestra el aviso de reemplazo y la liga al actual. */
  reemplazo?: boolean;
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
  const [aviso, setAviso] = useState<{ verificacion: Verificacion | null; enRevision: boolean } | null>(
    null,
  );

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
      const { verificacion, enRevision } = await onUpload({ dealId, file, fechaEntrega, firmaClienteConfirmada });
      if (enRevision || (verificacion && verificacion.estado !== "aprobado")) {
        setAviso({ verificacion: verificacion ?? null, enRevision: Boolean(enRevision) });
        return;
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el comprobante");
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
      <h3>{reemplazo ? "Reemplazar comprobante de entrega" : "Comprobante de entrega"}</h3>

      {reemplazo && (
        <p className="callout callout--warn">
          Ya hay un comprobante subido para este cliente.{" "}
          <ArchivoLink dealId={dealId} tipo="comprobante">
            Ver archivo actual
          </ArchivoLink>
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
            : reemplazo
              ? "Reemplazar comprobante"
              : "Guardar comprobante"}
        </button>
      </div>
    </form>
  );
}
