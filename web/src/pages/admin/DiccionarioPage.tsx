import { useEffect, useState } from "react";
import {
  adminGetFieldDictionaryCallable,
  adminSetFieldDictionaryCallable,
} from "../../lib/firebase";
import type { FieldDictionary } from "../../types/admin";
import { Badge, Cargando, MensajeInline, Notice, PageHeader, Tabs } from "../../components/admin/ui";

/** Las pestañas del apartado "Conexión con HubSpot". */
export function TabsHubspot() {
  return (
    <Tabs
      items={[
        { to: "/admin/diccionario", label: "Campos" },
        { to: "/admin/etapas-fecha", label: "Fechas de etapa" },
        { to: "/admin/etapas-cancelacion", label: "Cancelaciones" },
        { to: "/admin/etiquetas", label: "Nombres de columnas" },
      ]}
    />
  );
}

/** Encabezado común de las cuatro pestañas de HubSpot. */
export function EncabezadoHubspot() {
  return (
    <>
      <PageHeader
        titulo="Conexión con HubSpot"
        descripcion="Cómo lee Paydesk la información de HubSpot. Cambia esto solo si sabes qué propiedad o etapa corresponde en HubSpot."
      />
      <TabsHubspot />
    </>
  );
}

/**
 * La fecha de disposición de HubSpot se sigue leyendo, pero la tabla solo
 * la usa si así se configuró en Etapas del crédito; por defecto manda la
 * confirmación en caja. Sin esto, editar la propiedad y no ver cambio en
 * la columna parecería un error.
 */
export function AyudaOrigenDisposicion() {
  return (
    <span className="adm-field__ayuda">
      Solo cuenta si en Etapas del crédito la fecha de disposición sale de HubSpot. Si sale
      de Paydesk (la confirmación en caja), esta propiedad se sigue leyendo pero no se muestra.
    </span>
  );
}

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
  valeCodigo: "Vale · código de 10 dígitos",
  valeUrl: "Vale · liga que se manda por WhatsApp",
  valeEstado: "Vale · estatus",
  paydeskUrl: "Notificación · liga de Paydesk",
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
    return (
      <>
        <EncabezadoHubspot />
        <Notice tono="error">{error}</Notice>
      </>
    );
  }

  if (!campos) {
    return (
      <>
        <EncabezadoHubspot />
        <Cargando />
      </>
    );
  }

  const pendientes = Object.keys(defaults).filter((k) => (campos[k] ?? "").startsWith("TODO_")).length;

  return (
    <section>
      <EncabezadoHubspot />

      <p className="adm-field__ayuda" style={{ marginTop: 0 }}>
        Para cada dato que muestra Paydesk, el nombre interno de su propiedad en HubSpot
        (en HubSpot: Configuración → Propiedades → la propiedad → “Nombre interno”).
      </p>

      {pendientes > 0 && (
        <Notice tono="warn" titulo={`${pendientes} campos sin definir`}>
          Esos datos nunca tendrán valor en Paydesk hasta que captures su propiedad.
          Están marcados abajo.
        </Notice>
      )}
      <Notice tono="info">
        Un nombre mal escrito deja ese dato vacío en todas las tiendas. Revísalo en
        HubSpot antes de guardar; el cambio aplica en el siguiente minuto.
      </Notice>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {Object.keys(defaults).map((key) => {
          const valor = campos[key] ?? "";
          const esDefault = valor === defaults[key];
          const pendiente = valor.startsWith("TODO_");
          return (
            <div className="dictionary-row" key={key}>
              <label htmlFor={`campo-${key}`}>
                <span>
                  {ETIQUETAS[key] ?? key} {pendiente && <Badge tono="warn">Sin definir</Badge>}
                </span>
                {key === "disposicionCreditoFecha" && <AyudaOrigenDisposicion />}
              </label>
              <div className="dictionary-row__input">
                <input
                  id={`campo-${key}`}
                  type="text"
                  value={valor}
                  className={`adm-mono${pendiente ? " input--pendiente" : ""}`}
                  onChange={(e) =>
                    setCampos({ ...campos, [key]: e.target.value })
                  }
                  required
                />
                {!esDefault && (
                  <button
                    type="button"
                    className="adm-btn adm-btn--texto adm-btn--chico"
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
