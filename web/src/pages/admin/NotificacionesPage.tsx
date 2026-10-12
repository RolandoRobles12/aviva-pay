import { useEffect, useState } from "react";
import {
  adminGetNotificacionesCallable,
  adminProbarNotificacionCallable,
  adminSetNotificacionesCallable,
  type DestinoNotificacion,
  type EventoNotificacion,
  type NotificacionesConfig,
} from "../../lib/firebase";
import {
  BarraGuardar,
  Card,
  Cargando,
  Detalles,
  EmptyState,
  Field,
  MensajeInline,
  Notice,
  PageHeader,
  Switch,
} from "../../components/admin/ui";

const EVENTOS: { valor: EventoNotificacion; titulo: string; descripcion: string }[] = [
  {
    valor: "documento_en_revision",
    titulo: "Documento por revisar",
    descripcion: "Un documento quedó esperando a un administrador.",
  },
  {
    valor: "revision_atrasada",
    titulo: "Revisión atrasada",
    descripcion: "Un documento lleva demasiado tiempo esperando.",
  },
  {
    valor: "revision_resuelta",
    titulo: "Revisión resuelta",
    descripcion: "Alguien aprobó o rechazó un documento.",
  },
  {
    valor: "documento_rechazado",
    titulo: "Documento rechazado al subir",
    descripcion: "Era ilegible o no era el tipo de documento correcto.",
  },
  {
    valor: "error_sistema",
    titulo: "Errores del sistema",
    descripcion: "Algo falló: verificación, HubSpot o sincronización. Se agrupan para no llenar el canal.",
  },
];

/** IDs de Slack: canal `C…` (o `G…` si es privado); persona `U…` o `W…`. */
const FORMATO: Record<DestinoNotificacion["tipo"], { re: RegExp; ejemplo: string; error: string }> = {
  canal: {
    re: /^[CG][A-Z0-9]{6,}$/,
    ejemplo: "C0123ABCD",
    error: "Debe ser el ID del canal: empieza con C (o G si es privado), por ejemplo C0123ABCD.",
  },
  usuario: {
    re: /^[UW][A-Z0-9]{6,}$/,
    ejemplo: "U0123ABCD",
    error: "Debe ser el ID de la persona: empieza con U, por ejemplo U0123ABCD.",
  },
};

function idValido(d: DestinoNotificacion): boolean {
  return FORMATO[d.tipo].re.test(d.valor.trim());
}

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

  const formato = FORMATO[destino.tipo];
  const invalido = destino.valor.trim() !== "" && !idValido(destino);

  function alternarEvento(e: EventoNotificacion) {
    const eventos = destino.eventos.includes(e)
      ? destino.eventos.filter((x) => x !== e)
      : [...destino.eventos, e];
    onChange({ ...destino, eventos });
  }

  return (
    <div className="adm-fila">
      <div className="adm-fila__principal">
        <select
          aria-label="Tipo de destino"
          value={destino.tipo}
          onChange={(e) => onChange({ ...destino, tipo: e.target.value as DestinoNotificacion["tipo"] })}
        >
          <option value="canal">Canal de Slack</option>
          <option value="usuario">Persona (mensaje directo)</option>
        </select>
        <input
          type="text"
          className="adm-mono"
          aria-label={destino.tipo === "canal" ? "ID del canal" : "ID de la persona"}
          aria-invalid={invalido || undefined}
          value={destino.valor}
          // Los IDs de Slack van siempre en mayúsculas y sin espacios.
          onChange={(e) => onChange({ ...destino, valor: e.target.value.replace(/\s/g, "").toUpperCase() })}
          placeholder={formato.ejemplo}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="adm-fila__acciones">
          <button
            type="button"
            className="adm-btn adm-btn--secundario adm-btn--chico"
            onClick={probar}
            disabled={probando || !idValido(destino)}
          >
            {probando ? "Enviando..." : "Enviar prueba"}
          </button>
          <button type="button" className="adm-btn adm-btn--texto adm-btn--chico" onClick={onQuitar}>
            Quitar
          </button>
        </span>
      </div>
      {invalido && (
        <div className="adm-fila__extra">
          <MensajeInline ok={false}>{formato.error}</MensajeInline>
        </div>
      )}
      {prueba && (
        <div className="adm-fila__extra">
          <MensajeInline ok={prueba.ok}>{prueba.mensaje}</MensajeInline>
        </div>
      )}
      <div className="adm-fila__extra">
        <div className="adm-field__ayuda" style={{ marginBottom: "0.4rem" }}>
          Qué le avisamos:
        </div>
        <div className="adm-checks">
          {EVENTOS.map((e) => {
            const on = destino.eventos.includes(e.valor);
            return (
              <label key={e.valor} className={`adm-check${on ? " adm-check--on" : ""}`} title={e.descripcion}>
                <input type="checkbox" checked={on} onChange={() => alternarEvento(e.valor)} />
                {e.titulo}
              </label>
            );
          })}
        </div>
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
  const [original, setOriginal] = useState<NotificacionesConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    adminGetNotificacionesCallable()
      .then(({ data }) => {
        setConfig(data.config);
        setOriginal(data.config);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la configuración."));
  }, []);

  function actualizarDestino(i: number, d: DestinoNotificacion) {
    setConfig((c) => c && { ...c, destinos: c.destinos.map((x, j) => (j === i ? d : x)) });
  }

  async function guardar() {
    if (!config) return;
    if (config.destinos.some((d) => d.valor.trim() && !idValido(d))) {
      setMsg({ ok: false, texto: "Hay destinos con un ID que no es válido. Corrígelos antes de guardar." });
      return;
    }
    setGuardando(true);
    setMsg(null);
    try {
      const limpio: NotificacionesConfig = {
        ...config,
        destinos: config.destinos.map((d) => ({ ...d, valor: d.valor.trim() })).filter((d) => d.valor),
      };
      await adminSetNotificacionesCallable({ config: limpio });
      setConfig(limpio);
      setOriginal(limpio);
      setMsg({ ok: true, texto: "Guardado." });
    } catch (err) {
      setMsg({ ok: false, texto: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  }

  const hayCambios = Boolean(config && JSON.stringify(config) !== JSON.stringify(original));

  return (
    <section>
      <PageHeader
        titulo="Avisos en Slack"
        descripcion="A quién le avisa Paydesk y de qué: documentos por revisar, revisiones atrasadas y errores. Los avisos llevan a la bandeja de revisión, nunca al archivo."
      />
      {error && <Notice tono="error">{error}</Notice>}
      {!config && !error && <Cargando />}

      {config && (
        <>
          <Card>
            <Switch checked={config.activo} onChange={(activo) => setConfig({ ...config, activo })}>
              {config.activo ? "Los avisos están encendidos" : "Los avisos están apagados"}
            </Switch>
            {!config.activo && (
              <p className="adm-field__ayuda" style={{ margin: "0.5rem 0 0" }}>
                Mientras estén apagados, nadie se entera de documentos por revisar ni de errores.
              </p>
            )}
          </Card>

          {original?.destinos.some((d) => !idValido(d)) && (
            <Notice tono="warn">
              Hay destinos guardados por nombre o correo. Ahora Slack se configura por ID: cámbialos
              por el ID del canal o de la persona y guarda.
            </Notice>
          )}

          <Card
            titulo="¿A quién avisar?"
            descripcion="Agrega canales de Slack o personas, y elige qué le llega a cada uno."
            acciones={
              <button
                type="button"
                className="adm-btn adm-btn--secundario"
                onClick={() =>
                  setConfig({
                    ...config,
                    destinos: [
                      ...config.destinos,
                      { id: nuevoId(), tipo: "canal", valor: "", eventos: ["documento_en_revision", "revision_atrasada"] },
                    ],
                  })
                }
              >
                + Agregar
              </button>
            }
          >
            {config.destinos.length === 0 ? (
              <EmptyState icono="✉" titulo="Todavía no hay a quién avisar">
                Agrega el canal del equipo con su ID de Slack.
              </EmptyState>
            ) : (
              config.destinos.map((d, i) => (
                <Destino
                  key={d.id}
                  destino={d}
                  onChange={(nuevo) => actualizarDestino(i, nuevo)}
                  onQuitar={() => setConfig({ ...config, destinos: config.destinos.filter((_, j) => j !== i) })}
                />
              ))
            )}
            <Detalles resumen="¿Dónde encuentro el ID en Slack?">
              <p>
                <strong>Canal:</strong> abre el canal, haz clic en su nombre arriba y, al final de la
                ventana, copia el “ID del canal” (empieza con C). Si el canal es privado, invita primero
                al bot con <span className="adm-mono">/invite @Paydesk</span>.
              </p>
              <p>
                <strong>Persona:</strong> abre su perfil, haz clic en los tres puntos (⋮) y elige
                “Copiar ID de miembro” (empieza con U). Le llegan los avisos por mensaje directo.
              </p>
              <p>Usa “Enviar prueba” para confirmar que cada destino funciona.</p>
            </Detalles>
          </Card>

          <Card
            titulo="Recordatorio de revisiones atrasadas"
            descripcion="Si un documento lleva este tiempo esperando, se avisa una sola vez (a quien tenga marcado “Revisión atrasada”)."
          >
            <Field label="Avisar después de (horas)" htmlFor="recordatorio" ayuda="0 apaga el recordatorio.">
              <input
                id="recordatorio"
                type="number"
                min={0}
                max={168}
                value={config.recordatorioHoras}
                onChange={(e) => setConfig({ ...config, recordatorioHoras: Number(e.target.value) })}
                style={{ maxWidth: "8rem" }}
              />
            </Field>
          </Card>

          <BarraGuardar
            hayCambios={hayCambios}
            guardando={guardando}
            mensaje={msg}
            onGuardar={guardar}
            onDescartar={() => {
              setConfig(original);
              setMsg(null);
            }}
          />
        </>
      )}
    </section>
  );
}
