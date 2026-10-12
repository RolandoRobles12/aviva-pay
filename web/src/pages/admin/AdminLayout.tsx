import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { adminListRevisionesCallable, auth, logout } from "../../lib/firebase";
import { AdminRolProvider, useAdminRol } from "../../lib/adminRol";
import { BrandMark } from "../../components/BrandMark";
import "../../styles/admin.css";

interface ItemMenu {
  to: string;
  label: string;
  /** Otras rutas que pertenecen a este apartado (sus pestañas o detalle). */
  incluye?: string[];
  conteo?: "revisiones";
}

/**
 * El menú, agrupado por para qué se usa. "Día a día" es lo que un operador
 * abre todos los días; "Configuración" es lo que se toca de vez en cuando
 * y solo ve un super admin. Las pantallas hermanas (por ejemplo, las tres
 * de HubSpot) son pestañas dentro de un solo apartado, no entradas sueltas.
 */
const DIA_A_DIA: ItemMenu[] = [
  { to: "/admin/revision", label: "Revisión de documentos", conteo: "revisiones" },
  { to: "/admin/tiendas", label: "Tiendas" },
  { to: "/admin/vales", label: "Vales", incluye: ["/admin/reporte-vales"] },
  { to: "/admin/metricas", label: "Métricas" },
];

const CONFIGURACION: ItemMenu[] = [
  { to: "/admin/ocr", label: "Verificación de documentos" },
  { to: "/admin/notificaciones", label: "Avisos en Slack" },
  { to: "/admin/etapas", label: "Etapas del crédito" },
  {
    to: "/admin/diccionario",
    label: "Conexión con HubSpot",
    incluye: ["/admin/etapas-fecha", "/admin/etiquetas", "/admin/etapas-cancelacion"],
  },
  { to: "/admin/administradores", label: "Administradores" },
  { to: "/admin/estado", label: "Estado del sistema", incluye: ["/admin/bitacora"] },
];

function activo(item: ItemMenu, ruta: string): boolean {
  return [item.to, ...(item.incluye ?? [])].some((r) => ruta === r || ruta.startsWith(r + "/"));
}

function Enlace({ item, ruta, conteo, onIr }: { item: ItemMenu; ruta: string; conteo: number | null; onIr: () => void }) {
  const es = activo(item, ruta);
  return (
    <NavLink
      to={item.to}
      onClick={onIr}
      className={`adm-nav__link${es ? " adm-nav__link--activo" : ""}`}
      aria-current={es ? "page" : undefined}
    >
      <span>{item.label}</span>
      {item.conteo && conteo !== null && conteo > 0 && (
        <span className="adm-nav__badge" aria-label={`${conteo} pendientes`}>
          {conteo}
        </span>
      )}
    </NavLink>
  );
}

function Shell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rol = useAdminRol();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [revisiones, setRevisiones] = useState<number | null>(null);

  // El número junto a "Revisión de documentos" se actualiza al moverse por
  // el panel, para que quien aprueba vea bajar la cuenta.
  useEffect(() => {
    adminListRevisionesCallable()
      .then((r) => setRevisiones(r.data.revisiones.length))
      .catch(() => setRevisiones(null));
  }, [pathname]);

  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    navigate("/admin", { replace: true });
  }

  const cerrar = () => setMenuAbierto(false);

  return (
    <div className={`adm${menuAbierto ? " adm--menu-abierto" : ""}`}>
      <div className="adm-topbar">
        <BrandMark />
        <button
          type="button"
          className="adm-topbar__menu"
          onClick={() => setMenuAbierto(true)}
          aria-expanded={menuAbierto}
          aria-controls="adm-menu"
        >
          Menú
        </button>
      </div>
      <div className="adm-velo" onClick={cerrar} aria-hidden />

      <aside className="adm-sidebar" id="adm-menu">
        <div className="adm-sidebar__marca">
          <BrandMark />
        </div>
        <nav className="adm-nav" aria-label="Panel de administración">
          <Enlace item={{ to: "/admin/inicio", label: "Inicio" }} ruta={pathname} conteo={null} onIr={cerrar} />
          <div className="adm-nav__grupo">Día a día</div>
          {DIA_A_DIA.map((i) => (
            <Enlace key={i.to} item={i} ruta={pathname} conteo={revisiones} onIr={cerrar} />
          ))}
          {rol === "super" && (
            <>
              <div className="adm-nav__grupo">Configuración</div>
              {CONFIGURACION.map((i) => (
                <Enlace key={i.to} item={i} ruta={pathname} conteo={null} onIr={cerrar} />
              ))}
            </>
          )}
        </nav>
        <div className="adm-sidebar__usuario">
          <span className="adm-sidebar__correo" title={auth.currentUser?.email ?? undefined}>
            {auth.currentUser?.email}
          </span>
          <span className="adm-sidebar__rol">{rol === "super" ? "Super admin" : "Operador"}</span>
          <button type="button" className="adm-sidebar__salir" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="adm-main">
        <div className="adm-main__contenido">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AdminLayout() {
  return (
    <AdminRolProvider>
      <Shell />
    </AdminRolProvider>
  );
}
