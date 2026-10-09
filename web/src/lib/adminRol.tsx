import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth } from "./firebase";
import type { AdminRol } from "../types/admin";

/**
 * El rol del administrador con sesión, leído de su token. Es solo para la
 * interfaz (qué menús y botones mostrar): quien decide de verdad es cada
 * función del backend (auth/adminGuard.ts), que revisa el mismo claim.
 *
 * Sin `adminRol` en el token cuenta como `super`, igual que en el backend:
 * son las cuentas de antes de que existieran los roles.
 */
const AdminRolContext = createContext<AdminRol>("operador");

export function useAdminRol(): AdminRol {
  return useContext(AdminRolContext);
}

export function useEsSuperAdmin(): boolean {
  return useAdminRol() === "super";
}

/**
 * Lee el rol forzando un token fresco: si un super admin le cambió el rol
 * a esta persona, el token en caché (hasta una hora) todavía traería el
 * anterior. Recargar el panel basta para ver el cambio.
 */
export function AdminRolProvider({ children }: { children: ReactNode }) {
  const [rol, setRol] = useState<AdminRol | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const token = await auth.currentUser?.getIdTokenResult(true);
      if (!cancelado) setRol(token?.claims.adminRol === "operador" ? "operador" : "super");
    })().catch(() => {
      // Sin token fresco, lo más restrictivo: el backend rechazaría igual.
      if (!cancelado) setRol("operador");
    });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!rol) return <p className="page-message">Cargando...</p>;
  return <AdminRolContext.Provider value={rol}>{children}</AdminRolContext.Provider>;
}

/** Envuelve una pantalla que solo puede abrir un super admin. */
export function SoloSuperAdmin({ children }: { children: ReactNode }) {
  if (!useEsSuperAdmin()) {
    return (
      <p className="page-message page-message--error">
        Esta sección es solo para super administradores.
      </p>
    );
  }
  return <>{children}</>;
}
