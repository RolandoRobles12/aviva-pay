import { useEffect, useState } from "react";
import { adminGetEtapasCallable, adminSetEtapasCallable } from "../../lib/firebase";
import type { EtapaConfig } from "../../types/admin";

function nuevoId(): string {
  return `custom_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Las etapas del avance de un crédito: la barra de progreso, el embudo del
 * reporte y el filtro de "completadas". Las siete base se pueden quitar,
 * renombrar y reordenar; las personalizadas se agregan con el nombre
 * interno de una propiedad de fecha de HubSpot y cuentan como alcanzadas
 * cuando esa propiedad tiene valor (y agregan una columna a la tabla).
 *
 * Quitar una etapa base solo la saca del avance: su columna en la tabla se
 * queda, porque de ahí la tienda sube cotización y comprobante.
 */
export function EtapasPage() {
  const [etapas, setEtapas] = useState<EtapaConfig[] | null>(null);
  const [defaults, setDefaults] = useState<EtapaConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await adminGetEtapasCallable();
        setEtapas(result.data.etapas);
        setDefaults(result.data.defaults);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
      }
    })();
  }, []);

  function cambiar(index: number, parche: Partial<EtapaConfig>) {
    setEtapas((lista) => lista && lista.map((e, i) => (i === index ? { ...e, ...parche } : e)));
  }

  function mover(index: number, delta: -1 | 1) {
    setEtapas((lista) => {
      if (!lista) return lista;
      const destino = index + delta;
      if (destino < 0 || destino >= lista.length) return lista;
      const copia = [...lista];
      [copia[index], copia[destino]] = [copia[destino], copia[index]];
      return copia;
    });
  }

  function quitar(index: number) {
    setEtapas((lista) => lista && lista.filter((_, i) => i !== index));
  }

  function agregar() {
    setEtapas((lista) => [
      ...(lista ?? []),
      { id: nuevoId(), label: "", tipo: "personalizada", propiedad: "" },
    ]);
  }

  /** Las etapas base que se quitaron, para poder volver a ponerlas. */
  const baseFaltantes = defaults.filter(
    (d) => !(etapas ?? []).some((e) => e.id === d.id),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!etapas) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      const limpio = etapas.map((et) => ({
        ...et,
        label: et.label.trim(),
        ...(et.tipo === "personalizada" ? { propiedad: (et.propiedad ?? "").trim() } : {}),
      }));
      if (limpio.length === 0) throw new Error("Debe quedar al menos una etapa.");
      if (limpio.some((et) => !et.label)) throw new Error("Toda etapa necesita un nombre.");
      if (limpio.some((et) => et.tipo === "personalizada" && !et.propiedad)) {
        throw new Error("Las etapas nuevas necesitan la propiedad de HubSpot.");
      }
      await adminSetEtapasCallable({ etapas: limpio });
      setEtapas(limpio);
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !etapas) return <p className="page-message page-message--error">{error}</p>;
  if (!etapas) return <p className="page-message">Cargando configuración...</p>;

  return (
    <section>
      <h1 className="admin-title">Etapas</h1>
      <p className="admin-subtitle">
        Las etapas que forman el avance de cada crédito: la barra de progreso,
        el embudo del reporte y el filtro de completadas. El orden de aquí es
        el orden en que se muestran.
      </p>

      <div className="callout callout--warn">
        Una etapa nueva se marca como alcanzada cuando su propiedad de fecha en
        HubSpot (por ejemplo <code>hs_v2_date_entered_123456</code>) tiene valor,
        y agrega una columna a la tabla. Verifica el nombre interno en HubSpot:
        uno mal escrito nunca se marcará. Las fechas se leen en la siguiente
        sincronización de cada crédito (o con la sincronización completa).
      </div>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        {etapas.map((et, i) => (
          <div className="dictionary-row dictionary-row--stack" key={et.id}>
            <label>
              {et.tipo === "base" ? "Etapa base" : "Etapa personalizada"}
              <span className="dictionary-row__key">{et.id}</span>
            </label>
            <div className="stage-date-list">
              <div className="stage-date-list__row">
                <input
                  type="text"
                  value={et.label}
                  onChange={(e) => cambiar(i, { label: e.target.value })}
                  placeholder="Nombre de la etapa"
                />
                {et.tipo === "personalizada" && (
                  <input
                    type="text"
                    value={et.propiedad ?? ""}
                    onChange={(e) => cambiar(i, { propiedad: e.target.value })}
                    placeholder="propiedad_de_fecha_en_hubspot"
                  />
                )}
              </div>
              <div className="stage-date-list__actions">
                <button type="button" className="link-button" disabled={i === 0} onClick={() => mover(i, -1)}>
                  Subir
                </button>
                <button
                  type="button"
                  className="link-button"
                  disabled={i === etapas.length - 1}
                  onClick={() => mover(i, 1)}
                >
                  Bajar
                </button>
                <button type="button" className="link-button" onClick={() => quitar(i)}>
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="stage-date-list__actions">
          <button type="button" className="link-button" onClick={agregar}>
            + Agregar etapa
          </button>
          {baseFaltantes.map((b) => (
            <button
              key={b.id}
              type="button"
              className="link-button"
              onClick={() => setEtapas((lista) => [...(lista ?? []), b])}
            >
              Restaurar “{b.label}”
            </button>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}
        {guardado && <p className="form-success">Configuración guardada.</p>}

        <div className="dictionary-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
