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
import { InicioPage } from "./pages/admin/InicioPage";
import { CancelacionPage } from "./pages/admin/CancelacionPage";
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

function soloSuper(pagina: React.ReactNode) {
  return <SoloSuperAdmin>{pagina}</SoloSuperAdmin>;
}

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
        <Route path="inicio" element={<InicioPage />} />

        {/* Día a día: cualquier administrador */}
        <Route path="revision" element={<RevisionPage />} />
        <Route path="tiendas" element={<TiendasPage />} />
        <Route path="tiendas/:concesionarioId" element={<ConcesionarioPreviewPage />} />
        <Route path="vales" element={<ValesPage />} />
        <Route path="reporte-vales" element={<ReporteValesPage />} />
        <Route path="metricas" element={<MetricasPage />} />

        {/* Configuración: solo super admins */}
        <Route path="ocr" element={soloSuper(<OcrPage />)} />
        <Route path="notificaciones" element={soloSuper(<NotificacionesPage />)} />
        <Route path="etapas" element={soloSuper(<EtapasPage />)} />
        <Route path="diccionario" element={soloSuper(<DiccionarioPage />)} />
        <Route path="etapas-fecha" element={soloSuper(<EtapaFechasPage />)} />
        <Route path="etiquetas" element={soloSuper(<EtiquetasPage />)} />
        <Route path="etapas-cancelacion" element={soloSuper(<CancelacionPage />)} />
        <Route path="administradores" element={soloSuper(<AdminsPage />)} />
        <Route path="estado" element={soloSuper(<EstadoPage />)} />
        <Route path="bitacora" element={soloSuper(<BitacoraPage />)} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
