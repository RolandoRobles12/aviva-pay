import type { Verificacion } from "../lib/uploads";

/**
 * Qué pasó con el documento recién subido cuando no fue una aceptación
 * limpia. Para la tienda (`enRevision`): quedó guardado pero espera a un
 * administrador; se le dice que hubo un posible problema, en términos
 * genéricos, y que lo vuelva a subir si no está segura del archivo.
 * Para el admin (que nunca queda en revisión): lo que encontró la
 * verificación, solo como información.
 */
export function VerificacionAviso({
  verificacion,
  enRevision,
  onCerrar,
}: {
  verificacion: Verificacion | null;
  enRevision: boolean;
  onCerrar: () => void;
}) {
  const motivos = verificacion?.motivos ?? [];
  return (
    <div className="upload-form">
      <h3>{enRevision ? "Documento en revisión" : "Documento guardado con observaciones"}</h3>
      <div className="callout callout--warn">
        {enRevision ? (
          <>
            <p>
              Recibimos tu documento, pero encontramos un posible problema con
              él. El equipo de Aviva lo va a revisar; mientras tanto aparecerá
              como “En revisión”.
            </p>
            <p>
              Si no estás seguro de haber subido el archivo correcto, completo y
              legible, vuelve a subirlo.
            </p>
          </>
        ) : (
          <p>El documento se aplicó, pero la verificación encontró lo siguiente:</p>
        )}
        {/* Los motivos solo llegan en las subidas del admin: a la tienda nunca
            se le dice qué se detectó (ver functions/src/ocr/validate.ts). */}
        {!enRevision && motivos.length > 0 && (
          <>
            <ul>
              {motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="upload-form__actions">
        <button type="button" onClick={onCerrar}>
          Entendido
        </button>
      </div>
    </div>
  );
}
