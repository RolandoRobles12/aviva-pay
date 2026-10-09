import type { Verificacion } from "../lib/uploads";

/**
 * Lo que pasó con la verificación del documento recién subido, cuando no
 * fue un "aprobado" limpio. Se muestra antes de cerrar el formulario para
 * que la tienda sepa que el documento quedó en revisión y por qué — si el
 * archivo era el equivocado, puede reemplazarlo en ese momento.
 */
export function VerificacionAviso({
  verificacion,
  onCerrar,
}: {
  verificacion: Verificacion;
  onCerrar: () => void;
}) {
  const titulo =
    verificacion.estado === "no-verificado"
      ? "Documento guardado, pendiente de verificación"
      : "Documento guardado, en revisión";
  return (
    <div className="upload-form">
      <h3>{titulo}</h3>
      <div className="callout callout--warn">
        {verificacion.estado === "no-verificado" ? (
          <p>No pudimos verificar el documento automáticamente. El equipo de Aviva lo revisará.</p>
        ) : (
          <>
            <p>El equipo de Aviva revisará el documento por lo siguiente:</p>
            <ul>
              {verificacion.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>Si subiste el archivo equivocado, puedes reemplazarlo.</p>
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
