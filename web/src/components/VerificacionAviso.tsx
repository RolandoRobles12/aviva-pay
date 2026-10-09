import type { Verificacion } from "../lib/uploads";

/**
 * Qué pasó con el documento recién subido cuando no fue una aceptación
 * limpia. Para la tienda (`enRevision`): quedó guardado pero espera a un
 * administrador, y si hay algo que ella pueda corregir, aquí se le dice.
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
          <p>
            Recibimos tu documento. Antes de darlo por bueno, el equipo de Aviva
            lo va a revisar; mientras tanto aparecerá como “En revisión”.
          </p>
        ) : (
          <p>El documento se aplicó, pero la verificación encontró lo siguiente:</p>
        )}
        {motivos.length > 0 && (
          <>
            {enRevision && <p>Revisa esto, por si subiste el archivo equivocado:</p>}
            <ul>
              {motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        {enRevision && <p>Si el archivo no era el correcto, puedes reemplazarlo.</p>}
      </div>
      <div className="upload-form__actions">
        <button type="button" onClick={onCerrar}>
          Entendido
        </button>
      </div>
    </div>
  );
}
