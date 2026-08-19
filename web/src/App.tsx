import { Navigate, Route, Routes } from "react-router-dom";
import { ConcesionarioPage } from "./pages/ConcesionarioPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/404" replace />} />
      <Route path="/c/:concesionarioId" element={<ConcesionarioPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
