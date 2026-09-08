import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RestablecerContrasenaPage } from "./pages/RestablecerContrasenaPage";
import { ConcesionarioLayout } from "./pages/ConcesionarioLayout";
import { SolicitudesPage } from "./pages/SolicitudesPage";
import { ReportePage } from "./pages/ReportePage";
import { ValidarCodigoPage } from "./pages/ValidarCodigoPage";
import { ValePage } from "./pages/ValePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireAuth } from "./components/RequireAuth";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { TiendasPage } from "./pages/admin/TiendasPage";
import { DiccionarioPage } from "./pages/admin/DiccionarioPage";
import { EtapaFechasPage } from "./pages/admin/EtapaFechasPage";
import { AdminsPage } from "./pages/admin/AdminsPage";
import { ConcesionarioPreviewPage } from "./pages/admin/ConcesionarioPreviewPage";
import { EtiquetasPage } from "./pages/admin/EtiquetasPage";
import { ValesPage } from "./pages/admin/ValesPage";
import { ReporteValesPage } from "./pages/admin/ReporteValesPage";

export function App() {
  return (
    <Routes>
      {/* Concesionario */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/restablecer" element={<RestablecerContrasenaPage />} />

      {/* Cliente final: sin sesión — el token de la URL es lo que autoriza.
          Es el link que HubSpot le manda por WhatsApp. */}
      <Route path="/vale/:token" element={<ValePage />} />
      <Route
        path="/solicitudes"
        element={
          <RequireAuth redirectTo="/">
            <ConcesionarioLayout />
          </RequireAuth>
        }
      >
        <Route index element={<SolicitudesPage />} />
        <Route path="validar" element={<ValidarCodigoPage />} />
        <Route path="reporte" element={<ReportePage />} />
      </Route>

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
        <Route path="tiendas/:concesionarioId" element={<ConcesionarioPreviewPage />} />
        <Route path="diccionario" element={<DiccionarioPage />} />
        <Route path="etapas-fecha" element={<EtapaFechasPage />} />
        <Route path="etiquetas" element={<EtiquetasPage />} />
        <Route path="vales" element={<ValesPage />} />
        <Route path="reporte-vales" element={<ReporteValesPage />} />
        <Route path="administradores" element={<AdminsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
