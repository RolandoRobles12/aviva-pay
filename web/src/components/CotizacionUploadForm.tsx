import { useEffect, useRef, useState } from "react";
import { VerificacionAviso } from "./VerificacionAviso";
import { ArchivoLink } from "./ArchivoLink";
import { SolicitarRevisionManual } from "./SolicitarRevisionManual";
import { prepararArchivos } from "../lib/imagenes";
import { SelectorArchivos } from "./SelectorArchivos";
import type { Verificacion } from "../lib/uploads";
import { RECHAZOS_PARA_REVISION_MANUAL, SubidaError, uploadCotizacion } from "../lib/uploads";
import { CurrencyInput } from "./CurrencyInput";
import { AyudaLink } from "./AyudaLink";
import { motivoDeError, paso, registrarError } from "../lib/analitica";
import type { FieldLabels } from "../types/admin";

/** "Nueva cotización" module (section 5.2) — also used to replace an already-uploaded cotización. */
export function CotizacionUploadForm({
  dealId,
  labels,
  reemplazo = false,
  rechazosAuto = 0,
  onUploaded,
  onCancel,
  onUpload = uploadCotizacion,
}: {
  dealId: string;
  labels?: FieldLabels;
  /** Ya hay un documento: muestra el aviso de reemplazo y la liga al actual. */
  reemplazo?: boolean;
  /** Rechazos automáticos seguidos que ya lleva este documento (del deal). */
  rechazosAuto?: number;
  onUploaded: () => void;
  onCancel: () => void;
  /** Defaults to the concesionario endpoint; the admin preview passes adminUploadCotizacion instead. */
  onUpload?: typeof uploadCotizacion;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [fechaEntregaAcordada, setFechaEntregaAcordada] = useState("");
  const [montoTotalCompra, setMontoTotalCompra] = useState("");
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
    paso("cotizacion", "abrir");
    return () => {
      if (!guardado.current) paso("cotizacion", "cancelar");
    };
  }, []);

  async function enviar(solicitudManual: boolean) {
    if (files.length === 0) {
      paso("cotizacion", "error", "sin-archivo");
      setError("Selecciona un archivo (PDF, imagen o XML).");
      return;
    }
    setSubmitting(true);
    setEnviandoManual(solicitudManual);
    setError(null);
    paso("cotizacion", solicitudManual ? "manual" : "enviar");
    let preparando = true;
    try {
      // Fotos de iPhone (HEIC) y fotos muy pesadas se convierten aquí,
      // para que la verificación automática las pueda leer.
      const archivos = await prepararArchivos(files);
      preparando = false;
      const { verificacion, enRevision } = await onUpload({
        dealId,
        files: archivos,
        fechaEntregaAcordada,
        montoTotalCompra,
        ...(solicitudManual ? { solicitudManual } : {}),
      });
      guardado.current = true;
      const quedoEnRevision = Boolean(enRevision || (verificacion && verificacion.estado !== "aprobado"));
      paso("cotizacion", quedoEnRevision ? "revision" : "aprobado");
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
        paso("cotizacion", "rechazado");
      } else {
        const motivo = preparando ? "imagen" : motivoDeError(err);
        paso("cotizacion", "error", motivo);
        if (motivo === "servidor" && err instanceof Error) registrarError(err.message);
      }
      if (err instanceof SubidaError && err.revisionManualDisponible) setManualDisponible(true);
      setError(err instanceof Error ? err.message : "Error al subir la cotización");
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
        <h3>{reemplazo ? "Reemplazar cotización" : "Nueva cotización"}</h3>
        <AyudaLink leccion="documentos" />
      </div>

      {reemplazo && (
        <p className="callout callout--warn">
          Ya hay una cotización subida para este cliente.{" "}
          <ArchivoLink dealId={dealId} tipo="cotizacion">
            Ver archivo actual
          </ArchivoLink>
          . Subir un archivo nuevo la reemplazará.
        </p>
      )}

      <SelectorArchivos
        archivos={files}
        onChange={setFiles}
        accept=".pdf,.xml,image/*,.heic,.heif"
        titulo="Subir cotización"
        formatos="PDF, fotos o XML"
        onElegido={() => paso("cotizacion", "archivo")}
      />

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
              ? "Reemplazar cotización"
              : "Guardar cotización"}
        </button>
      </div>
    </form>
  );
}
