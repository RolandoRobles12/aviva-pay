import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RestablecerContrasenaPage } from "./pages/RestablecerContrasenaPage";
import { ConcesionarioLayout } from "./pages/ConcesionarioLayout";
import { SolicitudesPage } from "./pages/SolicitudesPage";
import { ReportePage } from "./pages/ReportePage";
import { ValidarCodigoPage } from "./pages/ValidarCodigoPage";
import { CanceladasPage } from "./pages/CanceladasPage";
import { ValePage } from "./pages/ValePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireAuth } from "./components/RequireAuth";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { SoloSuperAdmin } from "./lib/adminRol";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { TiendasPage } from "./pages/admin/TiendasPage";
import { DiccionarioPage } from "./pages/admin/DiccionarioPage";
import { MetricasPage } from "./pages/admin/MetricasPage";
import { RevisionPage } from "./pages/admin/RevisionPage";
import { BitacoraPage } from "./pages/admin/BitacoraPage";
import { EstadoPage } from "./pages/admin/EstadoPage";
import { NotificacionesPage } from "./pages/admin/NotificacionesPage";
import { OcrPage } from "./pages/admin/OcrPage";
import { EtapasPage } from "./pages/admin/EtapasPage";
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
        <Route path="canceladas" element={<CanceladasPage />} />
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
        <Route
          path="diccionario"
          element={
            <SoloSuperAdmin>
              <DiccionarioPage />
            </SoloSuperAdmin>
          }
        />
        <Route
          path="etapas"
          element={
            <SoloSuperAdmin>
              <EtapasPage />
            </SoloSuperAdmin>
          }
        />
        <Route
          path="etapas-fecha"
          element={
            <SoloSuperAdmin>
              <EtapaFechasPage />
            </SoloSuperAdmin>
          }
        />
        <Route path="revision" element={<RevisionPage />} />
        <Route path="metricas" element={<MetricasPage />} />
        <Route
          path="bitacora"
          element={
            <SoloSuperAdmin>
              <BitacoraPage />
            </SoloSuperAdmin>
          }
        />
        <Route
          path="estado"
          element={
            <SoloSuperAdmin>
              <EstadoPage />
            </SoloSuperAdmin>
          }
        />
        <Route
          path="notificaciones"
          element={
            <SoloSuperAdmin>
              <NotificacionesPage />
            </SoloSuperAdmin>
          }
        />
        <Route
          path="ocr"
          element={
            <SoloSuperAdmin>
              <OcrPage />
            </SoloSuperAdmin>
          }
        />
        <Route
          path="etiquetas"
          element={
            <SoloSuperAdmin>
              <EtiquetasPage />
            </SoloSuperAdmin>
          }
        />
        <Route path="vales" element={<ValesPage />} />
        <Route path="reporte-vales" element={<ReporteValesPage />} />
        <Route
          path="administradores"
          element={
            <SoloSuperAdmin>
              <AdminsPage />
            </SoloSuperAdmin>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
