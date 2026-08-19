import { Navigate, Route, Routes } from "react-router-dom";
import { DealStatusPage } from "./pages/DealStatusPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/404" replace />} />
      <Route path="/d/:dealId" element={<DealStatusPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
