import { useEffect, useRef, useState } from "react";
import { VerificacionAviso } from "./VerificacionAviso";
import { ArchivoLink } from "./ArchivoLink";
import { SolicitarRevisionManual } from "./SolicitarRevisionManual";
import { prepararArchivos } from "../lib/imagenes";
import { SelectorArchivos } from "./SelectorArchivos";
import type { Verificacion } from "../lib/uploads";
import { RECHAZOS_PARA_REVISION_MANUAL, SubidaError, uploadComprobante } from "../lib/uploads";
import type { FieldLabels } from "../types/admin";
import { AyudaLink } from "./AyudaLink";
import { motivoDeError, paso, registrarError } from "../lib/analitica";

/** "Comprobante de entrega" module (section 5.3) — also used to replace an already-uploaded comprobante. */
export function ComprobanteUploadForm({
  dealId,
  labels,
  reemplazo = false,
  rechazosAuto = 0,
  onUploaded,
  onCancel,
  onUpload = uploadComprobante,
}: {
  dealId: string;
  labels?: FieldLabels;
  /** Ya hay un documento: muestra el aviso de reemplazo y la liga al actual. */
  reemplazo?: boolean;
  /** Rechazos automáticos seguidos que ya lleva este documento (del deal). */
  rechazosAuto?: number;
  onUploaded: () => void;
  onCancel: () => void;
  /** Defaults to the concesionario endpoint; the admin preview passes adminUploadComprobante instead. */
  onUpload?: typeof uploadComprobante;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [firmaClienteConfirmada, setFirmaClienteConfirmada] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{
    verificacion: Verificacion | null;
    enRevision: boolean;
    solicitudManual: boolean;
  } | null>(null);
  const [manualDisponible, setManualDisponible] = useState(
    rechazosAuto >= RECHAZOS_PARA_REVISION_MANUAL,
  );
  const [enviandoManual, setEnviandoManual] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  /** Para la medición de uso: si se cierra la ventana sin que el documento quedara guardado. */
  const guardado = useRef(false);

  useEffect(() => {
    paso("comprobante", "abrir");
    return () => {
      if (!guardado.current) paso("comprobante", "cancelar");
    };
  }, []);

  async function enviar(solicitudManual: boolean) {
    if (files.length === 0) {
      paso("comprobante", "error", "sin-archivo");
      setError("Selecciona un archivo (PDF o imagen).");
      return;
    }
    if (!firmaClienteConfirmada) {
      paso("comprobante", "error", "sin-firma");
      setError("Debes confirmar que el cliente firmó el documento de entrega.");
      return;
    }
    setSubmitting(true);
    setEnviandoManual(solicitudManual);
    setError(null);
    paso("comprobante", solicitudManual ? "manual" : "enviar");
    let preparando = true;
    try {
      // Fotos de iPhone (HEIC) y fotos muy pesadas se convierten aquí,
      // para que la verificación automática las pueda leer.
      const archivos = await prepararArchivos(files);
      preparando = false;
      const { verificacion, enRevision } = await onUpload({
        dealId,
        files: archivos,
        fechaEntrega,
        firmaClienteConfirmada,
        ...(solicitudManual ? { solicitudManual } : {}),
      });
      guardado.current = true;
      const quedoEnRevision = Boolean(enRevision || (verificacion && verificacion.estado !== "aprobado"));
      paso("comprobante", quedoEnRevision ? "revision" : "aprobado");
      if (quedoEnRevision) {
        setAviso({
          verificacion: verificacion ?? null,
          enRevision: Boolean(enRevision),
          solicitudManual,
        });
        return;
      }
      onUploaded();
    } catch (err) {
      if (err instanceof SubidaError && err.status === 422) {
        paso("comprobante", "rechazado");
      } else {
        const motivo = preparando ? "imagen" : motivoDeError(err);
        paso("comprobante", "error", motivo);
        if (motivo === "servidor" && err instanceof Error) registrarError(err.message);
      }
      if (err instanceof SubidaError && err.revisionManualDisponible) setManualDisponible(true);
      setError(err instanceof Error ? err.message : "Error al subir el comprobante");
    } finally {
      setSubmitting(false);
      setEnviandoManual(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void enviar(false);
  }

  function solicitarManual() {
    // Mismos campos obligatorios que una subida normal: si se aprueba, se
    // aplica tal cual lo capturó la tienda.
    if (files.length > 0 && !formRef.current?.reportValidity()) return;
    void enviar(true);
  }

  if (aviso) {
    return (
      <VerificacionAviso
        verificacion={aviso.verificacion}
        enRevision={aviso.enRevision}
        solicitudManual={aviso.solicitudManual}
        onCerrar={onUploaded}
      />
    );
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit} ref={formRef}>
      <div className="upload-form__titulo">
        <h3>{reemplazo ? "Reemplazar comprobante de entrega" : "Comprobante de entrega"}</h3>
        <AyudaLink leccion="documentos" />
      </div>

      {reemplazo && (
        <p className="callout callout--warn">
          Ya hay un comprobante subido para este cliente.{" "}
          <ArchivoLink dealId={dealId} tipo="comprobante">
            Ver archivo actual
          </ArchivoLink>
          . Subir un archivo nuevo lo reemplazará.
        </p>
      )}

      <SelectorArchivos
        archivos={files}
        onChange={setFiles}
        accept=".pdf,image/*,.heic,.heif"
        titulo="Subir comprobante de entrega firmado"
        formatos="PDF o fotos"
        onElegido={() => paso("comprobante", "archivo")}
      />

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
      {manualDisponible && (
        <SolicitarRevisionManual
          enviando={enviandoManual}
          deshabilitado={submitting}
          onSolicitar={solicitarManual}
        />
      )}
      <div className="upload-form__actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" disabled={submitting}>
          {submitting && !enviandoManual
            ? "Subiendo..."
            : reemplazo
              ? "Reemplazar comprobante"
              : "Guardar comprobante"}
        </button>
      </div>
    </form>
  );
}
