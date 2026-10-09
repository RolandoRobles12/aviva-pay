import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../../lib/firebase";
import { AdminRolProvider, useAdminRol } from "../../lib/adminRol";
import { BrandMark } from "../../components/BrandMark";

/** El menú: lo de operación para todos, la configuración solo para super admins. */
const OPERACION = [
  { to: "/admin/tiendas", label: "Tiendas" },
  { to: "/admin/revision", label: "Revisión de documentos" },
  { to: "/admin/vales", label: "Vales" },
  { to: "/admin/reporte-vales", label: "Reporte de vales" },
];

const CONFIGURACION = [
  { to: "/admin/estado", label: "Estado del sistema" },
  { to: "/admin/diccionario", label: "Diccionario de campos" },
  { to: "/admin/etapas", label: "Etapas" },
  { to: "/admin/etapas-fecha", label: "Fechas de etapa" },
  { to: "/admin/etiquetas", label: "Etiquetas" },
  { to: "/admin/notificaciones", label: "Notificaciones" },
  { to: "/admin/ocr", label: "Verificación de documentos" },
  { to: "/admin/administradores", label: "Administradores" },
];

function Shell() {
  const navigate = useNavigate();
  const rol = useAdminRol();

  async function handleLogout() {
    await logout();
    navigate("/admin", { replace: true });
  }

  const links = rol === "super" ? [...OPERACION, ...CONFIGURACION] : OPERACION;

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <BrandMark />
        <nav className="admin-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <span className="form-note">{rol === "super" ? "Super admin" : "Operador"}</span>
        <button type="button" className="link-button" onClick={handleLogout}>
          Salir
        </button>
      </header>
      <main className="admin-shell__body">
        <Outlet />
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
