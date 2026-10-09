import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminEstadoSistemaCallable,
  adminMigrarLigasArchivosCallable,
  type EstadoSistema,
} from "../../lib/firebase";

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function Fila({ ok, titulo, children }: { ok: boolean; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`estado-fila ${ok ? "estado-fila--ok" : "estado-fila--alerta"}`}>
      <span aria-hidden>{ok ? "✓" : "!"}</span>
      <div>
        <strong>{titulo}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Si Paydesk está sano, de un vistazo. Solo super admins. */
export function EstadoPage() {
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrando, setMigrando] = useState(false);
  const [migracion, setMigracion] = useState<string | null>(null);

  useEffect(() => {
    adminEstadoSistemaCallable()
      .then((r) => setEstado(r.data))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el estado."));
  }, []);

  async function migrar() {
    setMigrando(true);
    setMigracion(null);
    try {
      const { data } = await adminMigrarLigasArchivosCallable();
      setMigracion(`Listo: ${data.migrados} de ${data.revisados} solicitudes actualizadas.`);
    } catch (err) {
      setMigracion(err instanceof Error ? err.message : "No se pudo migrar.");
    } finally {
      setMigrando(false);
    }
  }

  if (error) return <p className="page-message page-message--error">{error}</p>;
  if (!estado) return <p className="page-message">Cargando estado...</p>;

  const syncReciente =
    estado.sync.ultimaExito !== null && Date.now() - Date.parse(estado.sync.ultimaExito) < 2 * 3_600_000;

  return (
    <section>
      <h1 className="admin-title">Estado del sistema</h1>

      <div className="estado-lista">
        <Fila ok={estado.camposSinMapear.length === 0} titulo="Diccionario de campos">
          {estado.camposSinMapear.length === 0 ? (
            "Todos los campos tienen su propiedad de HubSpot."
          ) : (
            <>
              Sin propiedad de HubSpot (nunca tendrán valor):{" "}
              <code>{estado.camposSinMapear.join(", ")}</code>.{" "}
              <Link to="/admin/diccionario">Capturarlos</Link>
            </>
          )}
        </Fila>

        <Fila ok={syncReciente && !estado.sync.ultimoError} titulo="Sincronización periódica con HubSpot">
          Última exitosa {haceCuanto(estado.sync.ultimaExito)}.
          {estado.sync.ultimoResultado && <> {estado.sync.ultimoResultado}.</>}
          {estado.sync.ultimoError && <> Último error: {estado.sync.ultimoError}</>}
        </Fila>

        <Fila
          ok={
            estado.revisiones.pendientes === 0 ||
            (estado.revisiones.masAntiguaHoras ?? 0) < (estado.notificaciones.recordatorioHoras || 24)
          }
          titulo="Revisión de documentos"
        >
          {estado.revisiones.pendientes === 0 ? (
            "Nada pendiente."
          ) : (
            <>
              {estado.revisiones.pendientes} pendientes; el más antiguo lleva{" "}
              {estado.revisiones.masAntiguaHoras} h. <Link to="/admin/revision">Ir a la bandeja</Link>
            </>
          )}
        </Fila>

        <Fila
          ok={estado.notificaciones.activo && estado.notificaciones.destinos > 0}
          titulo="Notificaciones de Slack"
        >
          {estado.notificaciones.activo
            ? `Activas, ${estado.notificaciones.destinos} destinos.`
            : "Apagadas: los errores y las revisiones no le llegan a nadie."}{" "}
          <Link to="/admin/notificaciones">Configurar</Link>
        </Fila>

        <Fila ok={estado.verificacion.modo === "automatico"} titulo="Verificación de documentos">
          {estado.verificacion.modo === "automatico"
            ? `Automática, con Claude ${estado.verificacion.modelo === "sonnet" ? "Sonnet" : "Haiku"}.`
            : "Apagada: los documentos se aceptan sin verificar."}{" "}
          <Link to="/admin/ocr">Configurar y probar conexión</Link>
        </Fila>
      </div>

      <h2 className="admin-title admin-title--secondary">Ligas de archivos</h2>
      <p className="admin-subtitle">
        Las solicitudes de antes guardan ligas a sus archivos que no caducan. Esta
        migración las cambia por el esquema nuevo (ligas de 15 minutos) y saca de
        la solicitud los datos de verificación que la tienda no debe ver. Es
        segura de repetir.
      </p>
      <button type="button" className="upload-button" onClick={migrar} disabled={migrando}>
        {migrando ? "Migrando..." : "Migrar ligas y verificaciones"}
      </button>
      {migracion && <p className="form-note">{migracion}</p>}
    </section>
  );
}
