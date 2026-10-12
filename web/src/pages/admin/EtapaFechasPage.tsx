import { useEffect, useState } from "react";
import {
  adminGetStageDatePropertiesCallable,
  adminSetStageDatePropertiesCallable,
} from "../../lib/firebase";
import type { StageDateProperties } from "../../types/admin";
import { Cargando, MensajeInline, Notice } from "../../components/admin/ui";
import { EncabezadoHubspot } from "./DiccionarioPage";

/** Human labels for the five milestone dates, matching DiccionarioPage's style. */
const ETIQUETAS: Record<string, string> = {
  fechaSolicitud: "Fecha de solicitud",
  estatusKyc: "Estatus de KYC",
  creditoLiberadoFecha: "Crédito liberado",
  disposicionCreditoFecha: "Disposición del crédito",
  desembolsoFecha: "Desembolso del crédito",
  canceladoFecha: "Fecha de cancelación",
};

function mismaLista(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * For each milestone date, the extra HubSpot properties to check beyond
 * the field dictionary's own property — checked in order, first non-empty
 * wins (see functions/src/hubspot/deals.ts, stageDate()). Originally this
 * covered exactly one case (a deal in the obsolete legacy pipeline), but a
 * stage can be reachable through more than one HubSpot property for other
 * reasons too, so this supports any number per field.
 */
export function EtapaFechasPage() {
  const [propiedades, setPropiedades] = useState<StageDateProperties | null>(null);
  const [defaults, setDefaults] = useState<StageDateProperties>({});
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await adminGetStageDatePropertiesCallable();
        setPropiedades(result.data.propiedades);
        setDefaults(result.data.defaults);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo cargar la configuración.",
        );
      }
    })();
  }, []);

  function actualizarPropiedad(key: string, index: number, valor: string) {
    if (!propiedades) return;
    const lista = [...(propiedades[key] ?? [])];
    lista[index] = valor;
    setPropiedades({ ...propiedades, [key]: lista });
  }

  function agregarPropiedad(key: string) {
    if (!propiedades) return;
    setPropiedades({ ...propiedades, [key]: [...(propiedades[key] ?? []), ""] });
  }

  function quitarPropiedad(key: string, index: number) {
    if (!propiedades) return;
    setPropiedades({
      ...propiedades,
      [key]: (propiedades[key] ?? []).filter((_, i) => i !== index),
    });
  }

  function restaurar(key: string) {
    if (!propiedades) return;
    setPropiedades({ ...propiedades, [key]: [...(defaults[key] ?? [])] });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propiedades) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      // Blank rows (a text box left empty after "+ Agregar propiedad")
      // aren't property names — drop them before saving instead of
      // sending something the backend would just reject.
      const limpio: Partial<StageDateProperties> = {};
      for (const [key, lista] of Object.entries(propiedades)) {
        limpio[key] = lista.map((v) => v.trim()).filter(Boolean);
      }
      await adminSetStageDatePropertiesCallable({ propiedades: limpio });
      setPropiedades(limpio as StageDateProperties);
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !propiedades) {
    return (
      <>
        <EncabezadoHubspot />
        <Notice tono="error">{error}</Notice>
      </>
    );
  }

  if (!propiedades) {
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
        Si un crédito puede llegar a una etapa por más de un camino en HubSpot (por
        ejemplo, en el pipeline viejo), aquí se listan las otras propiedades donde puede
        estar esa fecha. Se revisan en orden y se usa la primera que tenga valor.
      </p>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {Object.keys(defaults).map((key) => {
          const lista = propiedades[key] ?? [];
          const esDefault = mismaLista(lista, defaults[key] ?? []);
          return (
            <div className="dictionary-row dictionary-row--stack" key={key}>
              <label>
                {ETIQUETAS[key] ?? key}
              </label>
              <div className="stage-date-list">
                {lista.length === 0 && (
                  <p className="stage-date-list__empty">
                    Sin propiedades adicionales para este campo.
                  </p>
                )}
                {lista.map((valor, i) => (
                  <div className="stage-date-list__row" key={i}>
                    <input
                      type="text"
                      value={valor}
                      onChange={(e) => actualizarPropiedad(key, i, e.target.value)}
                      placeholder="nombre_interno_de_la_propiedad"
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn--texto adm-btn--chico"
                      onClick={() => quitarPropiedad(key, i)}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <div className="stage-date-list__actions">
                  <button
                    type="button"
                    className="adm-btn adm-btn--texto adm-btn--chico"
                    onClick={() => agregarPropiedad(key)}
                  >
                    + Agregar propiedad
                  </button>
                  {!esDefault && (
                    <button
                      type="button"
                      className="adm-btn adm-btn--texto adm-btn--chico"
                      onClick={() => restaurar(key)}
                    >
                      Restaurar
                    </button>
                  )}
                </div>
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
