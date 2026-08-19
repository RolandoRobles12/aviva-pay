import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";

type SessionState =
  | { status: "checking" }
  | { status: "anon" }
  | { status: "signed-in"; user: User; isAdmin: boolean };

/**
 * Route guard. Waits for Firebase to restore the persisted session before
 * deciding — without that wait, a page refresh would bounce a signed-in
 * user back to login while the SDK is still initializing.
 *
 * `requireAdmin` additionally checks the `admin` custom claim, so a
 * concesionario session can't reach the admin panel by typing the URL.
 */
export function RequireAuth({
  children,
  requireAdmin = false,
  redirectTo,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  redirectTo: string;
}) {
  const [session, setSession] = useState<SessionState>({ status: "checking" });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession({ status: "anon" });
        return;
      }
      const token = await user.getIdTokenResult();
      setSession({
        status: "signed-in",
        user,
        isAdmin: token.claims.admin === true,
      });
    });
  }, []);

  if (session.status === "checking") {
    return <p className="page-message">Cargando...</p>;
  }

  if (session.status === "anon") {
    return <Navigate to={redirectTo} replace />;
  }

  if (requireAdmin && !session.isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
