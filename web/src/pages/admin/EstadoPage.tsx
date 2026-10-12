import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminEstadoSistemaCallable,
  adminMigrarLigasArchivosCallable,
  type EstadoSistema,
} from "../../lib/firebase";
import { Badge, Card, Cargando, Detalles, MensajeInline, Notice, PageHeader, Tabs } from "../../components/admin/ui";

/** Las pestañas del apartado "Estado del sistema". */
export function EncabezadoSistema() {
  return (
    <>
      <PageHeader
        titulo="Estado del sistema"
        descripcion="Si Paydesk está funcionando bien, y quién cambió la configuración."
      />
      <Tabs
        items={[
          { to: "/admin/estado", label: "Estado" },
          { to: "/admin/bitacora", label: "Historial de cambios" },
        ]}
      />
    </>
  );
}

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function Renglon({
  ok,
  titulo,
  children,
  accion,
}: {
  ok: boolean;
  titulo: string;
  children: React.ReactNode;
  accion?: { to: string; label: string };
}) {
  return (
    <div className="adm-estado">
      <Badge tono={ok ? "ok" : "warn"}>{ok ? "Bien" : "Revisar"}</Badge>
      <div className="adm-estado__texto">
        <strong>{titulo}</strong>
        <div className="adm-field__ayuda">{children}</div>
      </div>
      {accion && (
        <Link to={accion.to} className="adm-btn adm-btn--secundario adm-btn--chico">
          {accion.label}
        </Link>
      )}
    </div>
  );
}

/** Si Paydesk está sano, de un vistazo. Solo super admins. */
export function EstadoPage() {
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrando, setMigrando] = useState(false);
  const [migracion, setMigracion] = useState<{ ok: boolean; texto: string } | null>(null);

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
      setMigracion({ ok: true, texto: `Listo: ${data.migrados} de ${data.revisados} solicitudes actualizadas.` });
    } catch (err) {
      setMigracion({ ok: false, texto: err instanceof Error ? err.message : "No se pudo migrar." });
    } finally {
      setMigrando(false);
    }
  }

  if (error) {
    return (
      <>
        <EncabezadoSistema />
        <Notice tono="error">{error}</Notice>
      </>
    );
  }
  if (!estado) {
    return (
      <>
        <EncabezadoSistema />
        <Cargando />
      </>
    );
  }

  const syncReciente =
    estado.sync.ultimaExito !== null && Date.now() - Date.parse(estado.sync.ultimaExito) < 2 * 3_600_000;
  const revisionesOk =
    estado.revisiones.pendientes === 0 ||
    (estado.revisiones.masAntiguaHoras ?? 0) < (estado.notificaciones.recordatorioHoras || 24);

  return (
    <section>
      <EncabezadoSistema />

      <Card>
        <Renglon
          ok={estado.camposSinMapear.length === 0}
          titulo="Campos de HubSpot"
          accion={estado.camposSinMapear.length ? { to: "/admin/diccionario", label: "Definirlos" } : undefined}
        >
          {estado.camposSinMapear.length === 0
            ? "Todos los datos tienen su propiedad de HubSpot."
            : `${estado.camposSinMapear.length} datos sin propiedad de HubSpot: nunca tendrán valor en Paydesk.`}
        </Renglon>

        <Renglon ok={syncReciente && !estado.sync.ultimoError} titulo="Sincronización con HubSpot">
          Última vez que funcionó: {haceCuanto(estado.sync.ultimaExito)}.
          {estado.sync.ultimoError && <> Último error: {estado.sync.ultimoError}</>}
        </Renglon>

        <Renglon
          ok={revisionesOk}
          titulo="Revisión de documentos"
          accion={estado.revisiones.pendientes ? { to: "/admin/revision", label: "Ir a revisar" } : undefined}
        >
          {estado.revisiones.pendientes === 0
            ? "Nada pendiente."
            : `${estado.revisiones.pendientes} pendientes; el más antiguo lleva ${estado.revisiones.masAntiguaHoras} h.`}
        </Renglon>

        <Renglon
          ok={estado.notificaciones.activo && estado.notificaciones.destinos > 0}
          titulo="Avisos en Slack"
          accion={{ to: "/admin/notificaciones", label: "Configurar" }}
        >
          {estado.notificaciones.activo
            ? `Encendidos, a ${estado.notificaciones.destinos} ${estado.notificaciones.destinos === 1 ? "destino" : "destinos"}.`
            : "Apagados: nadie se entera de errores ni de documentos por revisar."}
        </Renglon>

        <Renglon
          ok={estado.verificacion.modo === "automatico"}
          titulo="Verificación de documentos"
          accion={{ to: "/admin/ocr", label: "Configurar" }}
        >
          {estado.verificacion.modo === "automatico"
            ? `Automática, con Claude ${estado.verificacion.modelo === "sonnet" ? "Sonnet" : "Haiku"}.`
            : "Apagada: los documentos se aceptan sin revisar."}
        </Renglon>

        {estado.sync.ultimoResultado && (
          <Detalles>
            <p>Última sincronización: {estado.sync.ultimoResultado}.</p>
            {estado.camposSinMapear.length > 0 && (
              <p>
                Campos sin definir: <span className="adm-mono">{estado.camposSinMapear.join(", ")}</span>
              </p>
            )}
          </Detalles>
        )}
      </Card>

      <Card
        titulo="Actualizar ligas de archivos"
        descripcion="Las solicitudes anteriores a esta versión guardan ligas a sus archivos que no caducan. Esto las cambia por ligas temporales y quita datos que la tienda no debe ver. Se corre una vez después de actualizar; repetirlo no hace daño."
        pie={
          <>
            {migracion && <MensajeInline ok={migracion.ok}>{migracion.texto}</MensajeInline>}
            <button type="button" className="adm-btn adm-btn--secundario" onClick={migrar} disabled={migrando}>
              {migrando ? "Actualizando..." : "Actualizar ligas"}
            </button>
          </>
        }
      />
    </section>
  );
}
