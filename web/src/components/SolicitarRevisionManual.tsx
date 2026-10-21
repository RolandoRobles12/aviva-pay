/**
 * La salida cuando la verificación automática rechazó el mismo documento
 * varias veces y la tienda cree que es correcto: en vez de seguir
 * reintentando, lo manda a que una persona de Aviva lo revise. El
 * documento queda "En revisión" en /admin/revision, como cualquier otro
 * que la verificación no pudo dar por bueno.
 *
 * Solo aparece después de RECHAZOS_PARA_REVISION_MANUAL rechazos (ver
 * lib/uploads.ts): antes, volver a subir el archivo correcto es lo que
 * casi siempre lo resuelve.
 */
export function SolicitarRevisionManual({
  enviando,
  deshabilitado,
  onSolicitar,
}: {
  enviando: boolean;
  deshabilitado: boolean;
  onSolicitar: () => void;
}) {
  return (
    <div className="callout callout--warn revision-manual">
      <p>
        <strong>¿Crees que es un error?</strong> Si estás seguro de que el documento es
        correcto, completo y legible, solicita que el equipo de Aviva lo verifique
        manualmente.
      </p>
      <button
        type="button"
        className="button-secondary"
        onClick={onSolicitar}
        disabled={deshabilitado}
      >
        {enviando ? "Enviando..." : "Solicitar verificación manual"}
      </button>
    </div>
  );
}
