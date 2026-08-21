import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { enviarRestablecerContrasena, loginConcesionario } from "../lib/firebase";
import { BrandMark } from "../components/BrandMark";
import { PasswordInput } from "../components/PasswordInput";

/**
 * Where a concesionario starts: email + password, the same account an
 * admin invited from the store catalog. There is no per-store secret link
 * — everyone comes to the same URL, which means a forwarded link leaks
 * nothing on its own.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "recuperar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recordar, setRecordar] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recuperado, setRecuperado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginConcesionario(email, password, recordar);
      navigate("/solicitudes", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("tienda")
          ? err.message
          : "Correo o contraseña incorrectos.",
      );
      setSubmitting(false);
    }
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await enviarRestablecerContrasena(email);
      setRecuperado(true);
    } catch {
      // Same message whether the account exists or not — otherwise this
      // becomes a way to probe which emails have accounts.
      setRecuperado(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (modo === "recuperar") {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={handleRecuperar}>
          <BrandMark centered />

          {recuperado ? (
            <>
              <p className="login-card__intro">
                Si <strong>{email}</strong> tiene una cuenta, le acabamos de
                mandar un correo para crear una nueva contraseña.
              </p>
              <button
                type="button"
                onClick={() => {
                  setModo("entrar");
                  setRecuperado(false);
                }}
              >
                Volver a entrar
              </button>
            </>
          ) : (
            <>
              <p className="login-card__intro">
                Escribe el correo con el que te invitaron y te mandamos una
                liga para crear tu contraseña.
              </p>
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
              {error && <p className="form-error">{error}</p>}
              <button type="submit" disabled={submitting}>
                {submitting ? "Enviando..." : "Enviar liga"}
              </button>
              <button
                type="button"
                className="link-button link-button--centered"
                onClick={() => setModo("entrar")}
              >
                Volver a entrar
              </button>
            </>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <BrandMark centered />

        <p className="login-card__intro">
          Ingresa con tu cuenta para consultar el estatus de los créditos de
          tus clientes.
        </p>

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
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="upload-form__checkbox">
          <input
            type="checkbox"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
          />
          Mantener sesión iniciada en este dispositivo
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        <button
          type="button"
          className="link-button link-button--centered"
          onClick={() => {
            setModo("recuperar");
            setError(null);
          }}
        >
          ¿Olvidaste tu contraseña?
        </button>

        <p className="login-card__help">
          ¿No tienes cuenta? Pídele a tu ejecutivo de Aviva que invite tu
          correo desde el panel.
        </p>

        <Link to="/admin" className="link-button link-button--centered">
          Ingreso para personal de Aviva
        </Link>
      </form>
    </main>
  );
}
