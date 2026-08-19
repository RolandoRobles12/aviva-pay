import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginAdmin } from "../../lib/firebase";

/** Aviva team sign-in. Firebase Auth email/password — accounts are created by the team, not self-service. */
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

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand-mark brand-mark--centered">
          <span className="brand-mark__aviva">Aviva</span>
          <span className="brand-mark__product">Pay Desk</span>
        </div>
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
      </form>
    </main>
  );
}
