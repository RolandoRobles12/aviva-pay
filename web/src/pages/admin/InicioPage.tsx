import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminEstadoSistemaCallable,
  adminListConcesionariosCallable,
  adminListRevisionesCallable,
  auth,
  type EstadoSistema,
} from "../../lib/firebase";
import { useEsSuperAdmin } from "../../lib/adminRol";
import { Card, Cargando, Notice, PageHeader } from "../../components/admin/ui";

function horasDesde(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
}

function textoHoras(h: number): string {
  if (h < 1) return "menos de una hora";
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} días`;
}

interface Problema {
  texto: string;
  accion: string;
  to: string;
}

/** Lo que conviene revisar en la configuración, en palabras simples. */
function problemasDelSistema(e: EstadoSistema): Problema[] {
  const p: Problema[] = [];
  if (e.camposSinMapear.length > 0) {
    p.push({
      texto: `${e.camposSinMapear.length} campos de HubSpot sin definir: esos datos no se ven en Paydesk.`,
      accion: "Definirlos",
      to: "/admin/diccionario",
    });
  }
  if (!e.notificaciones.activo || e.notificaciones.destinos === 0) {
    p.push({
      texto: "Los avisos de Slack están apagados: nadie se entera de revisiones ni de errores.",
      accion: "Configurar avisos",
      to: "/admin/notificaciones",
    });
  }
  if (e.verificacion.modo === "apagado") {
    p.push({
      texto: "La verificación de documentos está apagada: todo se acepta sin revisar.",
      accion: "Revisar",
      to: "/admin/ocr",
    });
  }
  const syncViejo =
    !e.sync.ultimaExito || Date.now() - Date.parse(e.sync.ultimaExito) > 2 * 3_600_000;
  if (e.sync.ultimoError || syncViejo) {
    p.push({
      texto: e.sync.ultimoError
        ? "La sincronización con HubSpot está fallando."
        : "La sincronización con HubSpot no ha corrido en las últimas 2 horas.",
      accion: "Ver detalle",
      to: "/admin/estado",
    });
  }
  return p;
}

/**
 * La primera pantalla del panel: qué necesita atención hoy, sin tener que
 * recorrer el menú. Para un super admin, además, lo que está mal
 * configurado.
 */
export function InicioPage() {
  const esSuper = useEsSuperAdmin();
  const [revisiones, setRevisiones] = useState<{ total: number; masAntigua: number | null } | null>(null);
  const [sinUsuarios, setSinUsuarios] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoSistema | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListRevisionesCallable()
      .then(({ data }) => {
        const subidas = data.revisiones.map((r) => horasDesde(r.revision.subidoEn));
        setRevisiones({ total: subidas.length, masAntigua: subidas.length ? Math.max(...subidas) : null });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar."));
    adminListConcesionariosCallable()
      .then(({ data }) => setSinUsuarios(data.concesionarios.filter((c) => c.usuarios.length === 0).length))
      .catch(() => setSinUsuarios(null));
    if (esSuper) {
      adminEstadoSistemaCallable()
        .then(({ data }) => setEstado(data))
        .catch(() => setEstado(null));
    }
  }, [esSuper]);

  const nombre = auth.currentUser?.displayName?.split(" ")[0];
  const problemas = estado ? problemasDelSistema(estado) : [];

  return (
    <section>
      <PageHeader
        titulo={nombre ? `Hola, ${nombre}` : "Inicio"}
        descripcion="Lo que necesita atención hoy."
      />
      {error && <Notice tono="error">{error}</Notice>}

      <div className="adm-grid">
        <Card>
          <div className="adm-resumen">
            <span className="adm-resumen__titulo">Documentos por revisar</span>
            {revisiones === null ? (
              <Cargando />
            ) : (
              <>
                <span
                  className={`adm-resumen__numero${revisiones.total > 0 ? " adm-resumen__numero--atencion" : ""}`}
                >
                  {revisiones.total}
                </span>
                <span className="adm-resumen__nota">
                  {revisiones.total === 0
                    ? "Nada pendiente. Las tiendas no están esperando a nadie."
                    : `El más antiguo lleva ${textoHoras(revisiones.masAntigua ?? 0)} esperando. La tienda lo ve “En revisión” hasta que lo resuelvas.`}
                </span>
                {revisiones.total > 0 && (
                  <Link to="/admin/revision" className="adm-btn adm-btn--primario">
                    Revisar documentos
                  </Link>
                )}
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="adm-resumen">
            <span className="adm-resumen__titulo">Tiendas sin usuarios</span>
            {sinUsuarios === null ? (
              <Cargando />
            ) : (
              <>
                <span
                  className={`adm-resumen__numero${sinUsuarios > 0 ? " adm-resumen__numero--atencion" : ""}`}
                >
                  {sinUsuarios}
                </span>
                <span className="adm-resumen__nota">
                  {sinUsuarios === 0
                    ? "Todas las tiendas tienen al menos una persona con acceso."
                    : "Nadie de esas tiendas puede entrar a Paydesk hasta que invites un correo."}
                </span>
                {sinUsuarios > 0 && (
                  <Link to="/admin/tiendas" className="adm-btn adm-btn--secundario">
                    Ir a Tiendas
                  </Link>
                )}
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="adm-resumen">
            <span className="adm-resumen__titulo">¿Un cliente perdió su vale?</span>
            <span className="adm-resumen__nota">
              Búscalo con el número de la solicitud y reemítelo en un paso.
            </span>
            <Link to="/admin/vales" className="adm-btn adm-btn--secundario">
              Buscar un vale
            </Link>
          </div>
        </Card>
      </div>

      {esSuper && estado && (
        <Card
          titulo="Configuración"
          descripcion={
            problemas.length === 0
              ? "Todo está configurado y funcionando."
              : "Esto conviene resolverlo para que Paydesk funcione completo."
          }
        >
          {problemas.length === 0 ? (
            <Notice tono="ok">Todo en orden.</Notice>
          ) : (
            problemas.map((p) => (
              <Notice key={p.to} tono="warn">
                <p>
                  {p.texto}{" "}
                  <Link to={p.to}>
                    <strong>{p.accion} →</strong>
                  </Link>
                </p>
              </Notice>
            ))
          )}
        </Card>
      )}
    </section>
  );
}
