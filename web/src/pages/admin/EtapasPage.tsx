import { useEffect, useState } from "react";
import { adminGetEtapasCallable, adminSetEtapasCallable } from "../../lib/firebase";
import type { EtapaConfig } from "../../types/admin";
import { Badge, BarraGuardar, Card, Cargando, Field, Notice, PageHeader } from "../../components/admin/ui";

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
  const [original, setOriginal] = useState<EtapaConfig[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await adminGetEtapasCallable();
        setEtapas(result.data.etapas);
        setOriginal(result.data.etapas);
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

  async function guardar() {
    if (!etapas) return;
    setSubmitting(true);
    setMsg(null);
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
      setOriginal(limpio);
      setMsg({ ok: true, texto: "Guardado." });
    } catch (err) {
      setMsg({ ok: false, texto: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setSubmitting(false);
    }
  }

  const encabezado = (
    <PageHeader
      titulo="Etapas del crédito"
      descripcion="Los pasos que forman el avance de cada crédito: la barra de progreso que ve la tienda y el embudo del reporte. Se muestran en este orden."
    />
  );

  if (error && !etapas) {
    return (
      <>
        {encabezado}
        <Notice tono="error">{error}</Notice>
      </>
    );
  }
  if (!etapas) {
    return (
      <>
        {encabezado}
        <Cargando />
      </>
    );
  }

  const hayCambios = JSON.stringify(etapas) !== JSON.stringify(original);

  return (
    <section>
      {encabezado}

      <Card
        acciones={
          <button type="button" className="adm-btn adm-btn--secundario" onClick={agregar}>
            + Agregar etapa
          </button>
        }
        titulo={`${etapas.length} etapas`}
        descripcion="Las etapas de Paydesk se calculan solas. Una etapa nueva se marca como cumplida cuando su propiedad de fecha en HubSpot tiene valor, y agrega una columna a la tabla de la tienda."
      >
        <ol className="adm-etapas">
          {etapas.map((et, i) => (
            <li key={et.id} className="adm-fila">
              <div className="adm-fila__principal">
                <span className="adm-etapas__num" aria-hidden>
                  {i + 1}
                </span>
                <input
                  type="text"
                  aria-label={`Nombre de la etapa ${i + 1}`}
                  value={et.label}
                  onChange={(e) => cambiar(i, { label: e.target.value })}
                  placeholder="Nombre de la etapa"
                />
                {et.tipo === "base" ? (
                  <Badge tono="neutro">De Paydesk</Badge>
                ) : (
                  <Badge tono="ok">Nueva</Badge>
                )}
                <span className="adm-fila__acciones">
                  <button
                    type="button"
                    className="adm-btn adm-btn--texto adm-btn--chico"
                    disabled={i === 0}
                    onClick={() => mover(i, -1)}
                    aria-label={`Subir ${et.label}`}
                    title="Subir"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--texto adm-btn--chico"
                    disabled={i === etapas.length - 1}
                    onClick={() => mover(i, 1)}
                    aria-label={`Bajar ${et.label}`}
                    title="Bajar"
                  >
                    ↓
                  </button>
                  <button type="button" className="adm-btn adm-btn--texto adm-btn--chico" onClick={() => quitar(i)}>
                    Quitar
                  </button>
                </span>
              </div>
              {et.tipo === "personalizada" && (
                <div className="adm-fila__extra">
                  <Field
                    label="Propiedad de fecha en HubSpot"
                    htmlFor={`prop-${et.id}`}
                    ayuda="El nombre interno de la propiedad, por ejemplo hs_v2_date_entered_123456. Si está mal escrito, la etapa nunca se marcará."
                  >
                    <input
                      id={`prop-${et.id}`}
                      type="text"
                      className="adm-mono"
                      value={et.propiedad ?? ""}
                      onChange={(e) => cambiar(i, { propiedad: e.target.value })}
                      placeholder="hs_v2_date_entered_..."
                    />
                  </Field>
                </div>
              )}
            </li>
          ))}
        </ol>

        {baseFaltantes.length > 0 && (
          <div className="adm-fila__extra">
            <span className="adm-field__ayuda">Etapas de Paydesk que quitaste: </span>
            {baseFaltantes.map((b) => (
              <button
                key={b.id}
                type="button"
                className="adm-btn adm-btn--texto adm-btn--chico"
                onClick={() => setEtapas((lista) => [...(lista ?? []), b])}
              >
                + {b.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <BarraGuardar
        hayCambios={hayCambios}
        guardando={submitting}
        mensaje={msg}
        onGuardar={guardar}
        onDescartar={() => {
          setEtapas(original);
          setMsg(null);
        }}
      />
    </section>
  );
}
