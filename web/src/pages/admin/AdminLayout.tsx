import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../../lib/firebase";

export function AdminLayout() {
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/admin", { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="brand-mark">
          <span className="brand-mark__aviva">Aviva</span>
          <span className="brand-mark__product">Pay Desk</span>
        </div>
        <nav className="admin-nav">
          <NavLink to="/admin/tiendas">Tiendas</NavLink>
          <NavLink to="/admin/diccionario">Diccionario de campos</NavLink>
          <NavLink to="/admin/administradores">Administradores</NavLink>
        </nav>
        {/* New tab: signing in as a store on this same tab would replace the
            admin's session, since both share one Firebase Auth instance. */}
        <Link to="/" target="_blank" rel="noopener noreferrer" className="link-button">
          Ver vista de tienda
        </Link>
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
