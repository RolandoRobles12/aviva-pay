import { useEffect, useState } from "react";
import {
  adminCreateAdminCallable,
  adminListAdminsCallable,
  adminRevokeAdminCallable,
  adminSetAdminRolCallable,
  auth,
} from "../../lib/firebase";
import type { AdminAuditEntry, AdminRol, AdminUser } from "../../types/admin";
import { Modal } from "../../components/Modal";
import { Badge, Card, Cargando, Detalles, Field, MensajeInline, Notice, OpcionesTarjeta, PageHeader } from "../../components/admin/ui";

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
  granted: "Recibió acceso",
  revoked: "Se le quitó el acceso",
  role_changed: "Rol cambiado",
};

const ROL_LABEL: Record<AdminRol, string> = {
  super: "Super admin",
  operador: "Operador",
};

const ROL_DESCRIPCION: Record<AdminRol, string> = {
  super: "Todo, incluida la configuración y el alta de administradores.",
  operador:
    "El día a día: revisión de documentos, tiendas y sus usuarios, vales y reportes. Sin configuración ni administradores.",
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
  const [rol, setRol] = useState<AdminRol>("operador");
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
      await adminCreateAdminCallable({ email: email.trim(), rol });
      setEmail("");
      await cargar();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo otorgar el acceso.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRol(admin: AdminUser, nuevo: AdminRol) {
    try {
      await adminSetAdminRolCallable({ uid: admin.uid, rol: nuevo });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el rol.");
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

  const encabezado = (
    <PageHeader
      titulo="Administradores"
      descripcion="Quién puede entrar a este panel y qué puede hacer. Las personas entran con “Continuar con Google” usando su correo de Aviva."
    />
  );

  if (error && !admins) {
    return (
      <>
        {encabezado}
        <Notice tono="error">{error}</Notice>
      </>
    );
  }

  if (!admins) {
    return (
      <>
        {encabezado}
        <Cargando />
      </>
    );
  }

  return (
    <section>
      {encabezado}
      {error && <Notice tono="error">{error}</Notice>}

      <Card titulo="Dar acceso a alguien">
        <form onSubmit={handleCreate}>
          <Field label="Correo" htmlFor="nuevo-admin">
            <input
              id="nuevo-admin"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@avivacredito.com"
              required
            />
          </Field>
          <div className="adm-field">
            <span className="adm-field__label">¿Qué podrá hacer?</span>
            <OpcionesTarjeta
              nombre="rol-nuevo"
              valor={rol}
              onChange={setRol}
              opciones={[
                { valor: "operador", titulo: ROL_LABEL.operador, descripcion: ROL_DESCRIPCION.operador },
                { valor: "super", titulo: ROL_LABEL.super, descripcion: ROL_DESCRIPCION.super },
              ]}
            />
          </div>
          <div className="adm-card__pie">
            {formError && <MensajeInline ok={false}>{formError}</MensajeInline>}
            <button type="submit" className="adm-btn adm-btn--primario" disabled={submitting}>
              {submitting ? "Dando acceso..." : "Dar acceso"}
            </button>
          </div>
        </form>
      </Card>

      <Card
        titulo="Quién tiene acceso"
        descripcion="Si cambias el rol de alguien, se aplica la próxima vez que abra o recargue el panel."
      >
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Rol</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.uid}>
                  <td>
                    <strong>{a.displayName ?? a.email}</strong>
                    {a.displayName && <div className="adm-field__ayuda">{a.email}</div>}
                  </td>
                  <td>
                    {a.uid === currentUid ? (
                      <Badge tono="neutro">{ROL_LABEL[a.rol]} · tú</Badge>
                    ) : (
                      <select
                        aria-label={`Rol de ${a.email}`}
                        value={a.rol}
                        onChange={(e) => handleRol(a, e.target.value as AdminRol)}
                      >
                        <option value="operador">{ROL_LABEL.operador}</option>
                        <option value="super">{ROL_LABEL.super}</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {formatFechaHora(a.grantedAt)}
                    {a.grantedByEmail && <div className="adm-field__ayuda">por {a.grantedByEmail}</div>}
                  </td>
                  <td>
                    {a.uid !== currentUid && (
                      <button
                        type="button"
                        className="adm-btn adm-btn--peligro adm-btn--chico"
                        onClick={() => setRevoking(a)}
                      >
                        Quitar acceso
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Detalles resumen="Historial de accesos">
          {auditLog.length === 0 ? (
            <p>Sin movimientos todavía.</p>
          ) : (
            <div className="adm-tabla-wrap">
              <table className="adm-tabla">
                <thead>
                  <tr>
                    <th>Cuándo</th>
                    <th>Qué pasó</th>
                    <th>Cuenta</th>
                    <th>Quién lo hizo</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry, i) => (
                    <tr key={i}>
                      <td>{formatFechaHora(entry.at)}</td>
                      <td>
                        {AUDIT_LABEL[entry.action]}
                        {entry.rol ? ` · ${ROL_LABEL[entry.rol]}` : ""}
                      </td>
                      <td>{entry.email}</td>
                      <td>{entry.performedByEmail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Detalles>
      </Card>

      {revoking && (
        <Modal onClose={() => setRevoking(null)}>
          <div className="upload-form">
            <h3>¿Quitar el acceso?</h3>
            <p className="form-note">
              {revoking.email} ya no podrá entrar al panel de administración. Puedes darle
              acceso de nuevo después si hace falta.
            </p>
            <div className="upload-form__actions">
              <button type="button" className="adm-btn adm-btn--secundario" onClick={() => setRevoking(null)}>
                Cancelar
              </button>
              <button type="button" className="adm-btn adm-btn--peligro" onClick={() => handleRevoke(revoking)}>
                Quitar acceso
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
