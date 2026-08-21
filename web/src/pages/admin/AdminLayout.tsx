import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../../lib/firebase";
import { BrandMark } from "../../components/BrandMark";

export function AdminLayout() {
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/admin", { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <BrandMark />
        <nav className="admin-nav">
          <NavLink to="/admin/tiendas">Tiendas</NavLink>
          <NavLink to="/admin/diccionario">Diccionario de campos</NavLink>
          <NavLink to="/admin/etiquetas">Etiquetas</NavLink>
          <NavLink to="/admin/administradores">Administradores</NavLink>
        </nav>
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
