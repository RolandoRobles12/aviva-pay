import { useEffect, useState } from "react";
import {
  adminGetFieldDictionaryCallable,
  adminSetFieldDictionaryCallable,
} from "../../lib/firebase";
import type { FieldDictionary } from "../../types/admin";

/** Human labels for the logical field names, so the screen doesn't read like source code. */
const ETIQUETAS: Record<string, string> = {
  kiosco: "Kiosco (tienda)",
  cliente: "Cliente",
  fechaSolicitud: "Fecha de solicitud",
  montoAprobado: "Monto aprobado",
  estatusKyc: "Estatus de KYC",
  cotizacionEstatus: "Cotización · estatus",
  cotizacionUrl: "Cotización · archivo",
  cotizacionFechaEntregaAcordada: "Cotización · fecha de entrega acordada",
  cotizacionMontoTotalCompra: "Cotización · monto total de la compra",
  creditoLiberadoFecha: "Crédito liberado · fecha",
  disposicionCreditoFecha: "Disposición del crédito · fecha",
  comprobanteEntregaEstatus: "Comprobante de entrega · estatus",
  comprobanteUrl: "Comprobante de entrega · archivo",
  comprobanteFechaEntrega: "Comprobante de entrega · fecha",
  comprobanteFirmaClienteConfirmada: "Comprobante de entrega · firma del cliente",
  desembolsoFecha: "Desembolso · fecha",
  paydeskUrl: "Notificación · liga de Pay Desk",
};

/**
 * Maps each field the page needs to its HubSpot internal property name.
 * Editable here so filling in the dictionary doesn't require a deploy —
 * but a wrong value silently breaks the sync for every store, hence the
 * warning and the "restore default" affordance per row.
 */
export function DiccionarioPage() {
  const [campos, setCampos] = useState<FieldDictionary | null>(null);
  const [defaults, setDefaults] = useState<FieldDictionary>({});
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await adminGetFieldDictionaryCallable();
        setCampos(result.data.campos);
        setDefaults(result.data.defaults);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el diccionario.",
        );
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campos) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      await adminSetFieldDictionaryCallable({ campos });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !campos) {
    return <p className="page-message page-message--error">{error}</p>;
  }

  if (!campos) {
    return <p className="page-message">Cargando diccionario...</p>;
  }

  return (
    <section>
      <h1 className="admin-title">Diccionario de campos</h1>
      <p className="admin-subtitle">
        Nombre interno de la propiedad en HubSpot para cada dato que muestra
        Pay Desk. Los valores que empiezan con <code>TODO_</code> siguen
        pendientes de mapear.
      </p>

      <div className="callout callout--warn">
        Un nombre mal capturado rompe la sincronización de todas las tiendas.
        Verifica cada propiedad en HubSpot antes de guardar. Los cambios
        aplican en pocos minutos, conforme se reinician las funciones.
      </div>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {Object.keys(defaults).map((key) => {
          const valor = campos[key] ?? "";
          const esDefault = valor === defaults[key];
          const pendiente = valor.startsWith("TODO_");
          return (
            <div className="dictionary-row" key={key}>
              <label htmlFor={`campo-${key}`}>
                {ETIQUETAS[key] ?? key}
                <span className="dictionary-row__key">{key}</span>
              </label>
              <div className="dictionary-row__input">
                <input
                  id={`campo-${key}`}
                  type="text"
                  value={valor}
                  className={pendiente ? "input--pendiente" : undefined}
                  onChange={(e) =>
                    setCampos({ ...campos, [key]: e.target.value })
                  }
                  required
                />
                {!esDefault && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      setCampos({ ...campos, [key]: defaults[key] })
                    }
                  >
                    Restaurar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {error && <p className="form-error">{error}</p>}
        {guardado && <p className="form-success">Diccionario guardado.</p>}

        <div className="dictionary-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar diccionario"}
          </button>
        </div>
      </form>
    </section>
  );
}
