import { useEffect, useState } from "react";
import { adminListBitacoraCallable, type EntradaBitacora } from "../../lib/firebase";

/** Nombre legible de cada documento de configuración. */
const DOCUMENTOS: Record<string, string> = {
  field_dictionary: "Diccionario de campos",
  field_labels: "Etiquetas",
  stage_date_properties: "Fechas de etapa",
  etapas: "Etapas",
  cancel_stages: "Etapas de cancelación",
  rollout: "Fecha de arranque",
  vale: "Vigencia de vales",
  ocr: "Verificación de documentos",
  notificaciones: "Notificaciones",
};

/** Las llaves de primer nivel que cambiaron, para no mostrar el documento entero. */
export function llavesCambiadas(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
): string[] {
  const llaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  return [...llaves].filter(
    (k) => JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(despues?.[k] ?? null),
  );
}

function Valor({ v }: { v: unknown }) {
  return <pre className="bitacora__valor">{v === undefined ? "—" : JSON.stringify(v, null, 2)}</pre>;
}

/** Quién cambió qué de la configuración y cómo estaba antes. Solo super admins. */
export function BitacoraPage() {
  const [entradas, setEntradas] = useState<EntradaBitacora[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListBitacoraCallable()
      .then((r) => setEntradas(r.data.entradas))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la bitácora."));
  }, []);

  if (error) return <p className="page-message page-message--error">{error}</p>;
  if (!entradas) return <p className="page-message">Cargando bitácora...</p>;

  return (
    <section>
      <h1 className="admin-title">Bitácora de configuración</h1>
      <p className="admin-subtitle">
        Los últimos 100 cambios a la configuración, con su valor anterior. Para
        deshacer uno, vuelve a capturar el valor anterior en su pantalla.
      </p>
      {entradas.length === 0 && <p className="page-message">Sin cambios registrados todavía.</p>}
      {entradas.map((e, i) => {
        const cambios = llavesCambiadas(e.antes, e.despues);
        return (
          <details key={i} className="bitacora">
            <summary>
              <strong>{DOCUMENTOS[e.documento] ?? e.documento}</strong> · {e.por} ·{" "}
              {e.en ? new Date(e.en).toLocaleString("es-MX") : "—"}
              <span className="form-note"> · {cambios.join(", ") || "sin cambios"}</span>
            </summary>
            {cambios.map((k) => (
              <div key={k} className="bitacora__cambio">
                <div className="bitacora__llave">{k}</div>
                <div className="bitacora__columnas">
                  <div>
                    <div className="form-note">Antes</div>
                    <Valor v={e.antes?.[k]} />
                  </div>
                  <div>
                    <div className="form-note">Después</div>
                    <Valor v={e.despues?.[k]} />
                  </div>
                </div>
              </div>
            ))}
          </details>
        );
      })}
    </section>
  );
}
