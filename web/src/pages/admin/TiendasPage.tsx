import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminListConcesionariosCallable,
  adminGetRolloutCallable,
  adminSetRolloutCallable,
  adminSyncConstruramaCallable,
  adminUpdateConcesionarioCallable,
  enviarRestablecerContrasena,
} from "../../lib/firebase";
import type { AdminConcesionario } from "../../types/admin";
import { Modal } from "../../components/Modal";
import { StatTiles } from "../../components/StatTiles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Store catalog. Rows appear on their own as deals sync from HubSpot —
 * this screen is for giving each store a name its people recognize
 * (HubSpot's `#0046 - TEQ CR` means nothing to them) and inviting the
 * people who work there. A store can have more than one invited email, and
 * the same email can be invited to more than one store — someone with
 * several stores sees all of them in one combined list once they sign in.
 */
export function TiendasPage() {
  const [tiendas, setTiendas] = useState<AdminConcesionario[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<AdminConcesionario | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<string | null>(null);
  /** What the last store edit actually did with the invited emails. */
  const [resultadoGuardado, setResultadoGuardado] = useState<string | null>(null);
  const [fechaRollout, setFechaRollout] = useState<string | null>(null);

  async function cargar() {
    try {
      const result = await adminListConcesionariosCallable();
      setTiendas(result.data.concesionarios);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo.");
    }
  }

  useEffect(() => {
    void cargar();
    void (async () => {
      try {
        const r = await adminGetRolloutCallable();
        setFechaRollout(r.data.fechaRollout);
      } catch {
        // Non-fatal: the catalog is still usable without the rollout date.
      }
    })();
  }, []);

  const filtradas = useMemo(() => {
    if (!tiendas) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return tiendas;
    return tiendas.filter(
      (t) =>
        t.nombre.toLowerCase().includes(q) ||
        t.kiosco.toLowerCase().includes(q) ||
        t.usuarios.some((u) => u.includes(q)),
    );
  }, [tiendas, busqueda]);

  const resumen = useMemo(() => {
    const lista = tiendas ?? [];
    return {
      total: lista.length,
      sinUsuarios: lista.filter((t) => t.usuarios.length === 0).length,
      conVarios: lista.filter((t) => t.usuarios.length > 1).length,
    };
  }, [tiendas]);

  async function sincronizar() {
    setSincronizando(true);
    setResultadoSync(null);
    setError(null);
    try {
      const result = await adminSyncConstruramaCallable();
      const { totalFound, synced, newStores, skippedNoConcesionario, failed } = result.data;
      setResultadoSync(
        `${synced} de ${totalFound} deals sincronizados · ${newStores} tiendas nuevas` +
          (skippedNoConcesionario ? ` · ${skippedNoConcesionario} sin Kiosco` : "") +
          (failed ? ` · ${failed} con error` : ""),
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  if (error && !tiendas) {
    return <p className="page-message page-message--error">{error}</p>;
  }

  if (!tiendas) {
    return <p className="page-message">Cargando tiendas...</p>;
  }

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">Tiendas</h1>
          <p className="admin-subtitle">
            Las tiendas aparecen aquí automáticamente conforme llegan
            solicitudes desde HubSpot. {tiendas.length} registradas.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button
            type="button"
            className="upload-button"
            onClick={sincronizar}
            disabled={sincronizando}
          >
            {sincronizando ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
          <input
            type="search"
            className="admin-search"
            placeholder="Buscar por nombre, kiosco o correo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {sincronizando && (
        <p className="page-message">
          Trayendo los deals de Construrama desde HubSpot — puede tardar varios minutos, no cierres esta pantalla.
        </p>
      )}
      {resultadoSync && <p className="form-success">{resultadoSync}</p>}
      {resultadoGuardado && <p className="form-success">{resultadoGuardado}</p>}
      {error && <p className="form-error">{error}</p>}

      <RolloutCard
        fecha={fechaRollout}
        onSaved={setFechaRollout}
        onError={setError}
      />

      <StatTiles
        stats={[
          { label: "Tiendas", value: resumen.total.toLocaleString("es-MX") },
          {
            label: "Sin usuarios invitados",
            value: resumen.sinUsuarios.toLocaleString("es-MX"),
            tone: resumen.sinUsuarios > 0 ? "accion" : "neutral",
          },
          {
            label: "Con más de un usuario",
            value: resumen.conVarios.toLocaleString("es-MX"),
          },
        ]}
      />

      <div className="deals-table-wrapper">
        <table className="deals-table">
          <thead>
            <tr>
              <th>Nombre visible</th>
              <th>Kiosco (HubSpot)</th>
              <th>Usuarios</th>
              <th>Arranque</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((t) => (
              <tr key={t.concesionarioId}>
                <td>{t.nombre}</td>
                <td className="cell-mono">{t.kiosco}</td>
                <td>
                  {t.usuarios.length === 0 ? (
                    <span className="cell-pending">Sin invitar</span>
                  ) : (
                    <span className="cell-done" title={t.usuarios.join(", ")}>
                      {t.usuarios.length === 1
                        ? t.usuarios[0]
                        : `${t.usuarios.length} correos`}
                    </span>
                  )}
                </td>
                <td>{t.rolloutDesde ?? "—"}</td>
                <td className="cell-actions">
                  <Link to={`/admin/tiendas/${t.concesionarioId}`} className="link-button">
                    Ver solicitudes
                  </Link>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setEditando(t)}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtradas.length === 0 && (
        <p className="page-message">Ninguna tienda coincide con la búsqueda.</p>
      )}

      {editando && (
        <Modal onClose={() => setEditando(null)}>
          <EditarTiendaForm
            tienda={editando}
            todasLasTiendas={tiendas}
            onCancel={() => setEditando(null)}
            onSaved={async (mensaje) => {
              setEditando(null);
              setResultadoGuardado(mensaje);
              await cargar();
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function EditarTiendaForm({
  tienda,
  todasLasTiendas,
  onCancel,
  onSaved,
}: {
  tienda: AdminConcesionario;
  /** The whole catalog, so the form can tell which emails already work at other stores. */
  todasLasTiendas: AdminConcesionario[];
  onCancel: () => void;
  onSaved: (mensaje: string | null) => void;
}) {
  const [nombre, setNombre] = useState(tienda.nombre);
  const [usuarios, setUsuarios] = useState<string[]>(tienda.usuarios);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [rolloutDesde, setRolloutDesde] = useState(tienda.rolloutDesde ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitando, setInvitando] = useState(false);
  // Emails whose store record saved fine but whose invite email failed to
  // send (throttling, a transient network error). Re-submitting the form
  // won't retry these on its own — usuarios already reflects them, so the
  // backend sees no diff to (re-)invite — so a dedicated retry is the only
  // way to actually resend.
  const [fallidos, setFallidos] = useState<string[]>([]);

  // Which other stores each listed email already works at. Computed from
  // the catalog the page already loaded — no extra call. Reflects saved
  // state, so typing an email that exists elsewhere surfaces it right
  // away, before saving.
  const otrasTiendas = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const email of usuarios) {
      const otras = todasLasTiendas
        .filter(
          (t) =>
            t.concesionarioId !== tienda.concesionarioId &&
            t.usuarios.includes(email),
        )
        .map((t) => t.nombre);
      if (otras.length > 0) mapa.set(email, otras);
    }
    return mapa;
  }, [usuarios, todasLasTiendas, tienda.concesionarioId]);

  async function enviarInvitaciones(emails: string[]) {
    setInvitando(true);
    const nuevosFallidos: string[] = [];
    await Promise.all(
      emails.map((email) =>
        enviarRestablecerContrasena(email).catch(() => {
          nuevosFallidos.push(email);
        }),
      ),
    );
    setInvitando(false);
    setFallidos(nuevosFallidos);
    return nuevosFallidos;
  }

  function agregarCorreo() {
    const email = nuevoCorreo.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setError(`"${email}" no parece un correo válido.`);
      return;
    }
    if (usuarios.includes(email)) {
      setNuevoCorreo("");
      return;
    }
    setUsuarios([...usuarios, email]);
    setNuevoCorreo("");
    setError(null);
  }

  function quitarCorreo(email: string) {
    setUsuarios(usuarios.filter((u) => u !== email));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFallidos([]);

    let invitados: string[];
    let yaActivos: string[];
    try {
      const result = await adminUpdateConcesionarioCallable({
        concesionarioId: tienda.concesionarioId,
        nombre,
        usuarios,
        rolloutDesde: rolloutDesde || null,
      });
      invitados = result.data.invitados;
      yaActivos = result.data.yaActivos;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSubmitting(false);
      return;
    }

    // The store record is already saved at this point — everything past
    // here is best-effort delivery of the invite email, not the save
    // itself, so a failure here must never be reported as "no se pudo
    // guardar" (it did) nor silently swallowed (the invite still needs to
    // reach that email somehow).
    if (invitados.length > 0) {
      const noEnviados = await enviarInvitaciones(invitados);
      if (noEnviados.length > 0) {
        setError(
          `La tienda se guardó, pero no se pudo enviar la invitación a: ${noEnviados.join(", ")}. Usa "Reintentar invitación" abajo.`,
        );
        setSubmitting(false);
        return;
      }
    }

    // Say plainly who got a mail and who didn't. Someone added to a second
    // store gets no email on purpose — without this line that silence
    // looks like the invite failed.
    const partes: string[] = [];
    if (invitados.length > 0) {
      partes.push(
        `Invitación enviada a ${invitados.join(", ")}`,
      );
    }
    if (yaActivos.length > 0) {
      partes.push(
        `${yaActivos.join(", ")} ya tenía contraseña, así que solo se le dio acceso a esta tienda (sin correo)`,
      );
    }
    onSaved(partes.join(" · ") || null);
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <h3>Editar tienda</h3>
      <p className="form-note">
        Kiosco en HubSpot: <span className="cell-mono">{tienda.kiosco}</span>
      </p>

      <label>
        Nombre visible para la tienda
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
      </label>

      <label>Usuarios con acceso</label>
      <p className="form-note">
        Cualquiera de estos correos puede entrar a esta tienda con su propia
        contraseña. Un correo puede tener acceso a más de una tienda.
      </p>
      <div className="chip-input">
        {usuarios.map((email) => (
          <span key={email} className="chip chip--removable">
            {email}
            {otrasTiendas.has(email) && (
              <span
                className="chip__badge"
                title={`También trabaja en: ${otrasTiendas.get(email)!.join(", ")}`}
              >
                +{otrasTiendas.get(email)!.length}
              </span>
            )}
            <button
              type="button"
              aria-label={`Quitar a ${email}`}
              onClick={() => quitarCorreo(email)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {otrasTiendas.size > 0 && (
        <ul className="otras-tiendas">
          {[...otrasTiendas].map(([email, nombres]) => (
            <li key={email}>
              <strong>{email}</strong> ya trabaja en {nombres.join(", ")} — al
              agregarlo aquí solo se le suma esta tienda, no se le pide crear
              otra contraseña.
            </li>
          ))}
        </ul>
      )}
      <div className="chip-input__add">
        <input
          type="email"
          placeholder="correo@ejemplo.com"
          value={nuevoCorreo}
          onChange={(e) => setNuevoCorreo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregarCorreo();
            }
          }}
        />
        <button type="button" className="button-secondary" onClick={agregarCorreo}>
          Agregar
        </button>
      </div>
      <p className="form-note">
        Un correo nuevo recibe una liga por email para crear su contraseña en
        cuanto guardes.
      </p>

      <label>
        Arranque solo para esta tienda (opcional)
        <input
          type="date"
          value={rolloutDesde}
          onChange={(e) => setRolloutDesde(e.target.value)}
        />
      </label>
      <p className="form-note">
        Úsalo si esta tienda arrancó en otra fecha que el resto. Vacío = sigue
        la fecha general.
      </p>

      {error && <p className="form-error">{error}</p>}

      {fallidos.length > 0 && (
        <button
          type="button"
          className="button-secondary"
          disabled={invitando}
          onClick={async () => {
            setError(null);
            const noEnviados = await enviarInvitaciones(fallidos);
            if (noEnviados.length > 0) {
              setError(
                `Sigue sin poder enviarse a: ${noEnviados.join(", ")}. Intenta de nuevo en unos minutos.`,
              );
            } else {
              onSaved(`Invitación enviada a ${fallidos.join(", ")}`);
            }
          }}
        >
          {invitando ? "Reintentando..." : "Reintentar invitación"}
        </button>
      )}

      <div className="upload-form__actions">
        <button
          type="button"
          className="button-secondary"
          onClick={onCancel}
          disabled={submitting || invitando}
        >
          Cancelar
        </button>
        <button type="submit" disabled={submitting || invitando}>
          {invitando ? "Enviando invitaciones..." : submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

/**
 * The date from which stores are actually asked for cotizaciones and
 * comprobantes. Deals approved before it are historical — visible, but
 * never counted as pending and never nagged about.
 *
 * Left unset (the default) every deal reads as historical, so no store is
 * chased for paperwork that doesn't exist. That is the safe state to sit
 * in while the rollout date is still undecided, which is why this card
 * says so plainly rather than looking like a missing setting.
 */
function RolloutCard({
  fecha,
  onSaved,
  onError,
}: {
  fecha: string | null;
  onSaved: (f: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const [valor, setValor] = useState(fecha ?? "");
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setValor(fecha ?? "");
  }, [fecha]);

  async function guardar(nueva: string | null) {
    setGuardando(true);
    setOk(false);
    onError(null);
    try {
      await adminSetRolloutCallable({ fechaRollout: nueva });
      onSaved(nueva);
      setOk(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar la fecha.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={`rollout-card${fecha ? "" : " rollout-card--pendiente"}`}>
      <div className="rollout-card__texto">
        <strong>Fecha de arranque</strong>
        <p>
          {fecha ? (
            <>
              A las tiendas se les piden cotizaciones y comprobantes de los
              créditos aprobados <strong>desde el {fecha}</strong>. Los
              anteriores se ven en su tabla, pero marcados como "Anterior" y
              sin pedirles nada.
            </>
          ) : (
            <>
              Sin definir. Mientras no la pongas, ninguna tienda ve
              pendientes: todos sus créditos se tratan como anteriores a Pay
              Desk. Defínela el día que arranques con ellas.
            </>
          )}
        </p>
      </div>
      <div className="rollout-card__control">
        <input
          type="date"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-label="Fecha de arranque"
        />
        <button
          type="button"
          className="upload-button"
          disabled={guardando || valor === (fecha ?? "")}
          onClick={() => guardar(valor || null)}
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={guardando}
          onClick={() => guardar(new Date().toISOString().slice(0, 10))}
        >
          Arrancar hoy
        </button>
        {fecha && (
          <button
            type="button"
            className="link-button link-button--muted"
            disabled={guardando}
            onClick={() => guardar(null)}
          >
            Quitar
          </button>
        )}
        {ok && <span className="form-success">Guardada.</span>}
      </div>
    </div>
  );
}
