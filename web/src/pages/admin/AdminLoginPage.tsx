import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginAdmin, loginAdminWithGoogle } from "../../lib/firebase";
import { BrandMark } from "../../components/BrandMark";

/** Aviva team sign-in. Firebase Auth (email/password or Google) — accounts are created by the team, not self-service. */
export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginAdmin(email, password);
      navigate("/admin/tiendas", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("panel")
          ? err.message
          : "Correo o contraseña incorrectos.",
      );
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await loginAdminWithGoogle();
      navigate("/admin/tiendas", { replace: true });
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

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <BrandMark centered />
        <p className="login-card__intro">Panel de administración</p>

        <label>
          Correo
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <div className="login-card__divider">o</div>

        <button
          type="button"
          className="button-secondary"
          disabled={submitting}
          onClick={handleGoogleLogin}
        >
          Continuar con Google
        </button>
      </form>
    </main>
  );
}
