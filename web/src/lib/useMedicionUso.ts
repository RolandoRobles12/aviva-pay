import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { iniciarMedicion } from "./analitica";

/**
 * Prende la medición de uso (lib/analitica.ts) mientras se ve el portal de
 * la tienda o del asesor, y le avisa cada cambio de pantalla. El panel de
 * Aviva y las páginas sin sesión no la usan.
 */
export function useMedicionUso() {
  const { pathname } = useLocation();
  useEffect(() => {
    iniciarMedicion(pathname);
  }, [pathname]);
}
