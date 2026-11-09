import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { destinoDeSesionAbierta, loginAdminWithGoogle } from "../../lib/firebase";
import { BrandMark } from "../../components/BrandMark";

/** Aviva team sign-in. Google only — accounts are created by the team, not self-service. */
export function AdminLoginPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisandoSesion, setRevisandoSesion] = useState(true);

  // Igual que en la entrada de tiendas: con la sesión abierta se entra directo.
  useEffect(() => {
    let cancelado = false;
    destinoDeSesionAbierta("admin")
      .then((destino) => {
        if (cancelado) return;
        if (destino) navigate(destino, { replace: true });
        else setRevisandoSesion(false);
      })
      .catch(() => {
        if (!cancelado) setRevisandoSesion(false);
      });
    return () => {
      cancelado = true;
    };
  }, [navigate]);

  async function handleGoogleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await loginAdminWithGoogle();
      navigate("/admin/inicio", { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("panel")) {
        setError(err.message);
      } else if (
        err instanceof Error &&
        (err.message.includes("popup-closed") || err.message.includes("cancelled"))
      ) {
        // User dismissed the Google popup — not an error worth showing.
      } else {
        setError("No se pudo iniciar sesión con Google.");
      }
      setSubmitting(false);
    }
  }

  if (revisandoSesion) {
    return <p className="page-message">Cargando...</p>;
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <BrandMark centered />
        <p className="login-card__intro">Panel de administración</p>

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          className="button-secondary"
          disabled={submitting}
          onClick={handleGoogleLogin}
        >
          {submitting ? "Entrando..." : "Continuar con Google"}
        </button>
      </div>
    </main>
  );
}
