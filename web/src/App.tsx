import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { ConcesionarioPage } from "./pages/ConcesionarioPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireAuth } from "./components/RequireAuth";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { TiendasPage } from "./pages/admin/TiendasPage";
import { DiccionarioPage } from "./pages/admin/DiccionarioPage";

export function App() {
  return (
    <Routes>
      {/* Concesionario */}
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/solicitudes"
        element={
          <RequireAuth redirectTo="/">
            <ConcesionarioPage />
          </RequireAuth>
        }
      />

      {/* Admin */}
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth requireAdmin redirectTo="/admin">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="tiendas" element={<TiendasPage />} />
        <Route path="diccionario" element={<DiccionarioPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
