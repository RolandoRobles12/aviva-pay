import { useEffect, useState } from "react";
import {
  adminGetFieldLabelsCallable,
  adminSetFieldLabelsCallable,
} from "../../lib/firebase";
import type { FieldLabels } from "../../types/admin";
import { Cargando, MensajeInline, Notice } from "../../components/admin/ui";
import { EncabezadoHubspot } from "./DiccionarioPage";

/** Where each label shows up, so editing it here isn't a guessing game. */
const CONTEXTO: Record<string, string> = {
  cliente: "Columna de la tabla",
  fechaSolicitud: "Columna de la tabla",
  montoAprobado: "Columna de la tabla",
  estatusKyc: "Columna de la tabla",
  cotizacionEstatus: "Columna de la tabla",
  cotizacionFechaEntregaAcordada: "Formulario \"Nueva cotización\"",
  cotizacionMontoTotalCompra: "Formulario \"Nueva cotización\"",
  creditoLiberadoFecha: "Columna de la tabla",
  disposicionCreditoFecha: "Columna de la tabla",
  comprobanteEntregaEstatus: "Columna de la tabla",
  comprobanteFechaEntrega: "Formulario \"Comprobante de entrega\"",
  comprobanteFirmaClienteConfirmada: "Formulario \"Comprobante de entrega\"",
  desembolsoFecha: "Columna de la tabla",
};

/**
 * Display text a concesionario sees — table columns and upload form
 * labels. Purely cosmetic: renaming here never changes which HubSpot
 * property a field reads from or whether it's required. For that, ver
 * Diccionario de campos.
 */
export function EtiquetasPage() {
  const [etiquetas, setEtiquetas] = useState<FieldLabels | null>(null);
  const [defaults, setDefaults] = useState<FieldLabels>({});
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await adminGetFieldLabelsCallable();
        setEtiquetas(result.data.etiquetas);
        setDefaults(result.data.defaults);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las etiquetas.");
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!etiquetas) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      await adminSetFieldLabelsCallable({ etiquetas });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !etiquetas) {
    return (
      <>
        <EncabezadoHubspot />
        <Notice tono="error">{error}</Notice>
      </>
    );
  }

  if (!etiquetas) {
    return (
      <>
        <EncabezadoHubspot />
        <Cargando />
      </>
    );
  }

  return (
    <section>
      <EncabezadoHubspot />
      <p className="adm-field__ayuda" style={{ marginTop: 0 }}>
        El texto que ve la tienda en su tabla y en los formularios para subir documentos.
        Solo cambia lo que se lee en pantalla; no cambia de dónde sale el dato.
      </p>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {Object.keys(defaults).map((key) => {
          const valor = etiquetas[key] ?? "";
          const esDefault = valor === defaults[key];
          return (
            <div className="dictionary-row" key={key}>
              <label htmlFor={`etiqueta-${key}`}>
                {defaults[key]}
                <span className="dictionary-row__key">{CONTEXTO[key] ?? key}</span>
              </label>
              <div className="dictionary-row__input">
                <input
                  id={`etiqueta-${key}`}
                  type="text"
                  value={valor}
                  onChange={(e) => setEtiquetas({ ...etiquetas, [key]: e.target.value })}
                  required
                />
                {!esDefault && (
                  <button
                    type="button"
                    className="adm-btn adm-btn--texto adm-btn--chico"
                    onClick={() => setEtiquetas({ ...etiquetas, [key]: defaults[key] })}
                  >
                    Restaurar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="adm-card__pie">
          {error && <MensajeInline ok={false}>{error}</MensajeInline>}
          {guardado && <MensajeInline ok>Guardado.</MensajeInline>}
          <button type="submit" className="adm-btn adm-btn--primario" disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
}
