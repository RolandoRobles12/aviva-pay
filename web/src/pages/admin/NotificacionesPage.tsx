import { useEffect, useState } from "react";
import {
  adminGetNotificacionesCallable,
  adminProbarNotificacionCallable,
  adminSetNotificacionesCallable,
  type DestinoNotificacion,
  type EventoNotificacion,
  type NotificacionesConfig,
} from "../../lib/firebase";

const EVENTOS: { valor: EventoNotificacion; titulo: string; descripcion: string }[] = [
  {
    valor: "documento_en_revision",
    titulo: "Documento en revisión",
    descripcion: "La verificación dejó una cotización o comprobante esperando a un administrador.",
  },
  {
    valor: "documento_rechazado",
    titulo: "Documento rechazado al subir",
    descripcion: "Se rechazó al momento por ilegible o por no ser el tipo de documento.",
  },
  {
    valor: "revision_resuelta",
    titulo: "Revisión resuelta",
    descripcion: "Un administrador aprobó o rechazó un documento en revisión.",
  },
];

function nuevoId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}`;
}

function Destino({
  destino,
  onChange,
  onQuitar,
}: {
  destino: DestinoNotificacion;
  onChange: (d: DestinoNotificacion) => void;
  onQuitar: () => void;
}) {
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [probando, setProbando] = useState(false);

  async function probar() {
    setProbando(true);
    setPrueba(null);
    try {
      const { tipo, valor } = destino;
      setPrueba((await adminProbarNotificacionCallable({ destino: { tipo, valor } })).data);
    } catch (err) {
      setPrueba({ ok: false, mensaje: err instanceof Error ? err.message : "No se pudo probar." });
    } finally {
      setProbando(false);
    }
  }

  function alternarEvento(e: EventoNotificacion) {
    const eventos = destino.eventos.includes(e)
      ? destino.eventos.filter((x) => x !== e)
      : [...destino.eventos, e];
    onChange({ ...destino, eventos });
  }

  return (
    <div className="dictionary-row dictionary-row--stack">
      <div className="stage-date-list__row">
        <select
          value={destino.tipo}
          onChange={(e) =>
            onChange({ ...destino, tipo: e.target.value as DestinoNotificacion["tipo"] })
          }
        >
          <option value="canal">Canal</option>
          <option value="usuario">Usuario</option>
        </select>
        <input
          type="text"
          value={destino.valor}
          onChange={(e) => onChange({ ...destino, valor: e.target.value })}
          placeholder={destino.tipo === "canal" ? "#paydesk-revisiones o C0123ABC" : "correo@avivacredito.com o U0123ABC"}
        />
      </div>
      <div className="notif-eventos">
        {EVENTOS.map((e) => (
          <label key={e.valor} className="notif-evento" title={e.descripcion}>
            <input
              type="checkbox"
              checked={destino.eventos.includes(e.valor)}
              onChange={() => alternarEvento(e.valor)}
            />{" "}
            {e.titulo}
          </label>
        ))}
      </div>
      <div className="stage-date-list__actions">
        <button
          type="button"
          className="link-button"
          onClick={probar}
          disabled={probando || !destino.valor.trim()}
        >
          {probando ? "Enviando..." : "Enviar prueba"}
        </button>
        <button type="button" className="link-button" onClick={onQuitar}>
          Quitar
        </button>
        {prueba && (
          <span className={prueba.ok ? "form-success" : "form-error"}>{prueba.mensaje}</span>
        )}
      </div>
    </div>
  );
}

/**
 * A quién avisa Paydesk en Slack y de qué. Cada destino es un canal o una
 * persona (mensaje directo del bot) con los eventos que le interesan: el
 * canal del equipo puede recibir todo y un supervisor solo lo que espera
 * revisión, por ejemplo.
 */
export function NotificacionesPage() {
  const [config, setConfig] = useState<NotificacionesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setConfig((await adminGetNotificacionesCallable()).data.config);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la configuración.");
      }
    })();
  }, []);

  function actualizarDestino(i: number, d: DestinoNotificacion) {
    setConfig((c) => c && { ...c, destinos: c.destinos.map((x, j) => (j === i ? d : x)) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    setGuardado(false);
    try {
      const limpio: NotificacionesConfig = {
        ...config,
        destinos: config.destinos
          .map((d) => ({ ...d, valor: d.valor.trim() }))
          .filter((d) => d.valor),
      };
      await adminSetNotificacionesCallable({ config: limpio });
      setConfig(limpio);
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !config) return <p className="page-message page-message--error">{error}</p>;
  if (!config) return <p className="page-message">Cargando configuración...</p>;

  return (
    <section>
      <h1 className="admin-title">Notificaciones</h1>
      <p className="admin-subtitle">
        Avisos de Paydesk en Slack. Agrega canales o personas y elige qué
        eventos recibe cada uno. Los mensajes llevan a la bandeja de revisión,
        nunca al archivo: la liga del documento no se comparte en Slack.
      </p>

      <div className="callout callout--warn">
        Para un canal privado, primero invita al bot de Paydesk al canal
        (<code>/invite @Paydesk</code>). Un usuario se escribe con su correo de
        Slack y recibe los avisos por mensaje directo del bot. Usa “Enviar
        prueba” para confirmar cada destino.
      </div>

      <form className="dictionary-form" onSubmit={handleSubmit}>
        <label className="notif-evento">
          <input
            type="checkbox"
            checked={config.activo}
            onChange={(e) => setConfig({ ...config, activo: e.target.checked })}
          />{" "}
          <strong>Enviar notificaciones</strong>
        </label>

        {config.destinos.length === 0 && (
          <p className="stage-date-list__empty">Todavía no hay destinos.</p>
        )}
        {config.destinos.map((d, i) => (
          <Destino
            key={d.id}
            destino={d}
            onChange={(nuevo) => actualizarDestino(i, nuevo)}
            onQuitar={() =>
              setConfig({ ...config, destinos: config.destinos.filter((_, j) => j !== i) })
            }
          />
        ))}

        <div className="stage-date-list__actions">
          <button
            type="button"
            className="link-button"
            onClick={() =>
              setConfig({
                ...config,
                destinos: [
                  ...config.destinos,
                  { id: nuevoId(), tipo: "canal", valor: "", eventos: ["documento_en_revision"] },
                ],
              })
            }
          >
            + Agregar canal o usuario
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {guardado && <p className="form-success">Configuración guardada.</p>}

        <div className="dictionary-form__actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
