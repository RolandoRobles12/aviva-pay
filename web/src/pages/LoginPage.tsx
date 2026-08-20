import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginConcesionario } from "../lib/firebase";

/**
 * Where a concesionario starts: código de tienda + NIP. There is no
 * per-store secret link — everyone comes to the same URL, which means a
 * forwarded link leaks nothing on its own.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState("");
  const [nip, setNip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginConcesionario(codigo, nip);
      navigate("/solicitudes", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos validar tus datos. Inténtalo de nuevo.",
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

        <p className="login-card__intro">
          Ingresa con los datos de tu tienda para consultar el estatus de los
          créditos de tus clientes.
        </p>

        <label>
          Código de tienda
          <input
            type="text"
            inputMode="numeric"
            autoComplete="username"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="0046"
            required
            autoFocus
          />
        </label>

        <label>
          NIP
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="••••••"
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <p className="login-card__help">
          ¿No tienes tu NIP o lo olvidaste? Contacta a tu ejecutivo de Aviva.
        </p>

        <Link to="/admin" className="link-button link-button--centered">
          Acceso administrador
        </Link>
      </form>
    </main>
  );
}
