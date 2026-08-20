import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminGenerarNipCallable,
  adminListConcesionariosCallable,
  adminGetRolloutCallable,
  adminSetRolloutCallable,
  adminSyncConstruramaCallable,
  adminUpdateConcesionarioCallable,
} from "../../lib/firebase";
import type { AdminConcesionario } from "../../types/admin";
import { Modal } from "../../components/Modal";
import { StatTiles } from "../../components/StatTiles";

function formatFecha(millis: number | null): string {
  if (!millis) return "—";
  return new Date(millis).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Store catalog. Rows appear on their own as deals sync from HubSpot —
 * this screen is for giving each store a name its people recognize
 * (HubSpot's `#0046 - TEQ CR` means nothing to them) and issuing the
 * credentials they log in with.
 */
export function TiendasPage() {
  const [tiendas, setTiendas] = useState<AdminConcesionario[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<AdminConcesionario | null>(null);
  const [nipGenerado, setNipGenerado] = useState<{
    tienda: AdminConcesionario;
    nip: string;
  } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<string | null>(null);
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
        t.codigo.toLowerCase().includes(q) ||
        t.kiosco.toLowerCase().includes(q),
    );
  }, [tiendas, busqueda]);

  const resumen = useMemo(() => {
    const lista = tiendas ?? [];
    return {
      total: lista.length,
      conNip: lista.filter((t) => t.tieneNip).length,
      sinNip: lista.filter((t) => !t.tieneNip).length,
      bloqueadas: lista.filter((t) => t.bloqueado).length,
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

  async function generarNip(tienda: AdminConcesionario) {
    try {
      const result = await adminGenerarNipCallable({
        concesionarioId: tienda.concesionarioId,
      });
      setNipGenerado({ tienda, nip: result.data.nip });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el NIP.");
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
            placeholder="Buscar por nombre, código o kiosco"
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
      {error && <p className="form-error">{error}</p>}

      <RolloutCard
        fecha={fechaRollout}
        onSaved={setFechaRollout}
        onError={setError}
      />

      <StatTiles
        stats={[
          { label: "Tiendas", value: resumen.total.toLocaleString("es-MX") },
          { label: "Con NIP activo", value: resumen.conNip.toLocaleString("es-MX") },
          {
            label: "Sin NIP",
            value: resumen.sinNip.toLocaleString("es-MX"),
            tone: resumen.sinNip > 0 ? "accion" : "neutral",
          },
          {
            label: "Bloqueadas",
            value: resumen.bloqueadas.toLocaleString("es-MX"),
            tone: resumen.bloqueadas > 0 ? "accion" : "neutral",
          },
        ]}
      />

      <div className="deals-table-wrapper">
        <table className="deals-table">
          <thead>
            <tr>
              <th>Nombre visible</th>
              <th>Kiosco (HubSpot)</th>
              <th>Código</th>
              <th>NIP</th>
              <th>Último acceso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((t) => (
              <tr key={t.concesionarioId}>
                <td>{t.nombre}</td>
                <td className="cell-mono">{t.kiosco}</td>
                <td className="cell-mono">{t.codigo}</td>
                <td>
                  {t.bloqueado ? (
                    <span className="pill pill--warn">Bloqueada</span>
                  ) : t.tieneNip ? (
                    <span className="cell-done">
                      Activo · {formatFecha(t.nipActualizadoEn)}
                    </span>
                  ) : (
                    <span className="cell-pending">Sin NIP</span>
                  )}
                </td>
                <td>{formatFecha(t.ultimoAccesoEn)}</td>
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
                  <button
                    type="button"
                    className="upload-button"
                    onClick={() => generarNip(t)}
                  >
                    {t.tieneNip ? "Regenerar NIP" : "Generar NIP"}
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
            onCancel={() => setEditando(null)}
            onSaved={async () => {
              setEditando(null);
              await cargar();
            }}
          />
        </Modal>
      )}

      {nipGenerado && (
        <Modal onClose={() => setNipGenerado(null)}>
          <div className="upload-form">
            <h3>NIP de {nipGenerado.tienda.nombre}</h3>
            <p className="nip-display">{nipGenerado.nip}</p>
            <p className="form-note">
              Anótalo y compártelo con la tienda ahora. Por seguridad solo se
              guarda cifrado, así que esta es la única vez que se muestra — si
              lo pierdes, genera uno nuevo.
            </p>
            <p className="form-note">
              La tienda entra con el código <strong>{nipGenerado.tienda.codigo}</strong>.
            </p>
            <div className="upload-form__actions">
              <button type="button" onClick={() => setNipGenerado(null)}>
                Listo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function EditarTiendaForm({
  tienda,
  onCancel,
  onSaved,
}: {
  tienda: AdminConcesionario;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(tienda.nombre);
  const [codigo, setCodigo] = useState(tienda.codigo);
  const [rolloutDesde, setRolloutDesde] = useState(tienda.rolloutDesde ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminUpdateConcesionarioCallable({
        concesionarioId: tienda.concesionarioId,
        nombre,
        codigo,
        rolloutDesde: rolloutDesde || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSubmitting(false);
    }
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

      <label>
        Código de acceso
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          required
        />
      </label>
      <p className="form-note">
        Si cambias el código, la tienda deberá usar el nuevo para entrar.
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

      <div className="upload-form__actions">
        <button
          type="button"
          className="button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancelar
        </button>
        <button type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar"}
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
