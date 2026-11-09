import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  destinoDeSesionAbierta,
  enviarRestablecerContrasena,
  loginConcesionario,
} from "../lib/firebase";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recuperado, setRecuperado] = useState(false);
  // Mientras se revisa si ya hay sesión, no se enseña el formulario: verlo
  // un instante y luego saltar a la lista se lee como "me sacó".
  const [revisandoSesion, setRevisandoSesion] = useState(true);

  // Con la sesión abierta (otra ventana, un marcador a la dirección
  // principal), se entra directo en vez de pedir la contraseña otra vez.
  useEffect(() => {
    let cancelado = false;
    destinoDeSesionAbierta("tienda")
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const destino = await loginConcesionario(email, password);
      navigate(destino, { replace: true });
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

  if (revisandoSesion) {
    return <p className="page-message">Cargando...</p>;
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

        <Link to="/ayuda" className="link-button link-button--centered">
          ¿Primera vez? Conoce cómo funciona Paydesk
        </Link>

        <Link to="/admin" className="link-button link-button--centered">
          Ingreso para personal de Aviva
        </Link>
      </form>
    </main>
  );
}
