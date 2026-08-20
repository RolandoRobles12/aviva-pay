import { useEffect, useState } from "react";
import {
  adminCreateAdminCallable,
  adminListAdminsCallable,
  adminRevokeAdminCallable,
  auth,
} from "../../lib/firebase";
import type { AdminAuditEntry, AdminUser } from "../../types/admin";
import { Modal } from "../../components/Modal";

function formatFechaHora(millis: number): string {
  return new Date(millis).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AUDIT_LABEL: Record<AdminAuditEntry["action"], string> = {
  granted: "Acceso otorgado",
  revoked: "Acceso revocado",
};

/**
 * Who can enter `/admin` and the history of who granted/revoked that
 * access. The claim itself is granted here through `adminCreateAdmin`, not
 * by editing Firestore directly — see docs/ARCHITECTURE.md.
 */
export function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AdminUser | null>(null);

  const currentUid = auth.currentUser?.uid;

  async function cargar() {
    try {
      const result = await adminListAdminsCallable();
      setAdmins(result.data.admins);
      setAuditLog(result.data.auditLog);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista.");
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminCreateAdminCallable({ email: email.trim() });
      setEmail("");
      await cargar();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo otorgar el acceso.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(admin: AdminUser) {
    try {
      await adminRevokeAdminCallable({ uid: admin.uid });
      setRevoking(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el acceso.");
      setRevoking(null);
    }
  }

  if (error && !admins) {
    return <p className="page-message page-message--error">{error}</p>;
  }

  if (!admins) {
    return <p className="page-message">Cargando administradores...</p>;
  }

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">Administradores</h1>
          <p className="admin-subtitle">
            Quién tiene acceso al panel de Aviva. La persona agregada entra
            con "Continuar con Google" usando el mismo correo.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <form className="upload-form" onSubmit={handleCreate}>
        <label>
          Correo del nuevo administrador
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@avivacredito.com"
            required
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <div className="upload-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Otorgando..." : "Otorgar acceso"}
          </button>
        </div>
      </form>

      <div className="deals-table-wrapper">
        <table className="deals-table">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Nombre</th>
              <th>Otorgado por</th>
              <th>Desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.uid}>
                <td className="cell-mono">{a.email}</td>
                <td>{a.displayName ?? "—"}</td>
                <td>{a.grantedByEmail ?? "—"}</td>
                <td>{formatFechaHora(a.grantedAt)}</td>
                <td className="cell-actions">
                  {a.uid === currentUid ? (
                    <span className="form-note">Eres tú</span>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setRevoking(a)}
                    >
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="admin-title admin-title--secondary">Historial</h2>
      <div className="deals-table-wrapper">
        <table className="deals-table">
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Acción</th>
              <th>Cuenta</th>
              <th>Realizado por</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((entry, i) => (
              <tr key={i}>
                <td>{formatFechaHora(entry.at)}</td>
                <td>{AUDIT_LABEL[entry.action]}</td>
                <td className="cell-mono">{entry.email}</td>
                <td>{entry.performedByEmail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auditLog.length === 0 && (
        <p className="page-message">Sin movimientos todavía.</p>
      )}

      {revoking && (
        <Modal onClose={() => setRevoking(null)}>
          <div className="upload-form">
            <h3>Revocar acceso</h3>
            <p className="form-note">
              {revoking.email} ya no podrá entrar al panel de
              administración. Puedes otorgarle acceso de nuevo después si
              hace falta.
            </p>
            <div className="upload-form__actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRevoking(null)}
              >
                Cancelar
              </button>
              <button type="button" onClick={() => handleRevoke(revoking)}>
                Revocar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
