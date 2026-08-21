import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../lib/firebase";
import { BrandMark } from "../components/BrandMark";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }
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

  return (
    <main className="login-page">
      <div className="login-card">
        <BrandMark centered />

        {state.status === "verificando" && (
          <p className="login-card__intro">Verificando tu liga...</p>
        )}

        {state.status === "error" && (
          <>
            <p className="form-error">{state.message}</p>
            <Link to="/" className="link-button link-button--centered">
              Ir a la pantalla de entrar
            </Link>
          </>
        )}

        {state.status === "hecho" && (
          <>
            <p className="form-success">
              Listo, tu contraseña quedó guardada. Ya puedes entrar con ella.
            </p>
            <Link to="/">
              <button type="button">Entrar</button>
            </Link>
          </>
        )}

        {state.status === "lista" && (
          <form onSubmit={handleSubmit}>
            <p className="login-card__intro">
              Crea tu contraseña para <strong>{state.email}</strong>.
            </p>

            <label>
              Contraseña
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label>
              Confirmar contraseña
              <input
                type="password"
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                required
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
