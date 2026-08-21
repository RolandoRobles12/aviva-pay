import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../lib/firebase";
import { BrandMark } from "../components/BrandMark";
import { PasswordInput } from "../components/PasswordInput";

const MIN_LENGTH = 6;

type LoadState =
  | { status: "verificando" }
  | { status: "lista"; email: string }
  | { status: "error"; message: string }
  | { status: "hecho" };

/**
 * Where the link in the invite / "olvidé mi contraseña" email actually
 * lands — see enviarRestablecerContrasena in lib/firebase.ts, which points
 * Firebase's oobCode link here (`actionCodeSettings.url`) instead of at
 * Firebase's own generic, unbranded action-handler page. Same page for
 * both cases: Firebase doesn't distinguish "first password" from "new
 * password", it's the same oobCode mechanism either way.
 *
 * A bare password form with no context is exactly what a phishing page
 * looks like, so this leans on: the same branded card as every other
 * screen, a line naming where the invite came from, and feedback on the
 * password as you type rather than only after a failed submit.
 */
export function RestablecerContrasenaPage() {
  const [params] = useSearchParams();
  const oobCode = params.get("oobCode");
  const [state, setState] = useState<LoadState>({ status: "verificando" });
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!oobCode) {
      setState({
        status: "error",
        message: "Este link no es válido. Pide que te reenvíen la invitación.",
      });
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => setState({ status: "lista", email }))
      .catch(() =>
        setState({
          status: "error",
          message:
            "Este link ya expiró o ya se usó. Pide que te reenvíen la invitación desde el panel, o usa \"¿Olvidaste tu contraseña?\" en la pantalla de entrar.",
        }),
      );
  }, [oobCode]);

  const cumpleLongitud = password.length >= MIN_LENGTH;
  const coincide = confirmacion.length > 0 && password === confirmacion;
  const puedeEnviar = cumpleLongitud && coincide;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeEnviar) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirmPasswordReset(auth, oobCode!, password);
      setState({ status: "hecho" });
    } catch {
      setError("No se pudo guardar la contraseña. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  if (state.status === "verificando") {
    return (
      <main className="login-page">
        <div className="login-card">
          <BrandMark centered />
          <p className="login-card__intro">Verificando tu liga...</p>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="login-page">
        <div className="login-card">
          <BrandMark centered />
          <p className="form-error">{state.message}</p>
          <Link to="/" className="link-button link-button--centered">
            Ir a la pantalla de entrar
          </Link>
        </div>
      </main>
    );
  }

  if (state.status === "hecho") {
    return (
      <main className="login-page">
        <div className="login-card">
          <BrandMark centered />
          <p className="form-success">
            Listo, tu contraseña quedó guardada. Ya puedes entrar con ella.
          </p>
          <Link to="/">
            <button type="button">Entrar</button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <BrandMark centered />

        <p className="login-card__intro">
          Crea tu contraseña para <strong>{state.email}</strong>.
        </p>

        <p className="trust-note">
          <span aria-hidden>🔒</span>
          Esta liga es válida porque tu correo fue invitado a Pay Desk desde
          el panel de Aviva. Solo tú vas a ver esta contraseña — Aviva nunca
          te la va a pedir por teléfono, WhatsApp o correo.
        </p>

        <label>
          Contraseña
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            autoFocus
          />
        </label>
        <p className="password-hint">Mínimo {MIN_LENGTH} caracteres.</p>

        <label>
          Confirmar contraseña
          <PasswordInput
            value={confirmacion}
            onChange={setConfirmacion}
            autoComplete="new-password"
            required
          />
        </label>
        {confirmacion.length > 0 && (
          <p className={`password-match ${coincide ? "password-match--ok" : "password-match--no"}`}>
            {coincide ? "✓ Coinciden" : "Las contraseñas no coinciden"}
          </p>
        )}

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting || !puedeEnviar}>
          {submitting ? "Guardando..." : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}
