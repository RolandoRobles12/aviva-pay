import { useEffect, useState } from "react";
import { adminListBitacoraCallable, type EntradaBitacora } from "../../lib/firebase";
import { llavesCambiadas } from "../../lib/bitacora";
import { Cargando, EmptyState, Notice } from "../../components/admin/ui";
import { EncabezadoSistema } from "./EstadoPage";

/** Nombre legible de cada documento de configuración. */
const DOCUMENTOS: Record<string, string> = {
  field_dictionary: "Diccionario de campos",
  field_labels: "Etiquetas",
  stage_date_properties: "Fechas de etapa",
  etapas: "Etapas",
  disposicion: "Fecha de disposición",
  cancel_stages: "Etapas de cancelación",
  rollout: "Fecha de arranque",
  vale: "Vigencia de vales",
  ocr: "Verificación de documentos",
  notificaciones: "Avisos en Slack",
};

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

  if (error) {
    return (
      <>
        <EncabezadoSistema />
        <Notice tono="error">{error}</Notice>
      </>
    );
  }
  if (!entradas) {
    return (
      <>
        <EncabezadoSistema />
        <Cargando />
      </>
    );
  }

  return (
    <section>
      <EncabezadoSistema />
      <p className="adm-field__ayuda" style={{ marginTop: 0 }}>
        Los últimos 100 cambios a la configuración, con su valor anterior. Para deshacer uno,
        vuelve a capturar el valor anterior en su pantalla.
      </p>
      {entradas.length === 0 && <EmptyState titulo="Sin cambios registrados todavía" />}
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
