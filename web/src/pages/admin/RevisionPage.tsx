import { useEffect, useState } from "react";
import {
  adminListRevisionesCallable,
  adminResolverRevisionCallable,
  type RevisionPendiente,
} from "../../lib/firebase";
import { ArchivoLink } from "../../components/ArchivoLink";

const TIPO: Record<RevisionPendiente["tipo"], string> = {
  cotizacion: "Cotización",
  comprobante: "Comprobante de entrega",
};

const ESTADO: Record<string, string> = {
  revisar: "Algo no cuadra",
  rechazado: "No pasó la verificación",
  "no-verificado": "No se pudo verificar",
};

function moneda(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Lo que capturó la tienda, en palabras. */
function Capturado({ r }: { r: RevisionPendiente }) {
  const c = r.revision.capturado;
  return r.tipo === "cotizacion" ? (
    <>
      <dt>Monto capturado</dt>
      <dd>{moneda(c.montoTotalCompra ? Number(c.montoTotalCompra) : null)}</dd>
      <dt>Entrega acordada</dt>
      <dd>{c.fechaEntregaAcordada || "—"}</dd>
    </>
  ) : (
    <>
      <dt>Fecha de entrega capturada</dt>
      <dd>{c.fechaEntrega || "—"}</dd>
    </>
  );
}

function Tarjeta({ r, onResuelta }: { r: RevisionPendiente; onResuelta: () => void }) {
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState<"aprobar" | "rechazar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v = r.verificacion;
  const leido = v?.datos;

  async function resolver(decision: "aprobar" | "rechazar") {
    if (decision === "rechazar" && !comentario.trim()) {
      setError("Escribe el motivo del rechazo: es lo que verá la tienda.");
      return;
    }
    setEnviando(decision);
    setError(null);
    try {
      await adminResolverRevisionCallable({
        dealId: r.dealId,
        tipo: r.tipo,
        decision,
        comentario: comentario.trim(),
      });
      onResuelta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la decisión.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <article className="revision-card">
      <header className="revision-card__header">
        <div>
          <strong>{r.cliente ?? "Sin nombre"}</strong> · {r.tienda ?? "Sin tienda"}
          <div className="revision-card__meta">
            {TIPO[r.tipo]} · subido {new Date(r.revision.subidoEn).toLocaleString("es-MX")} · deal{" "}
            {r.dealId}
          </div>
        </div>
        <ArchivoLink dealId={r.dealId} tipo={r.tipo} revision className="upload-button">
          Ver documento
        </ArchivoLink>
      </header>

      <div className="callout callout--warn">
        <strong>{v ? ESTADO[v.estado] ?? v.estado : "Sin verificación"}</strong>
        {v && v.motivos.length > 0 && (
          <ul>
            {v.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {v?.errorTecnico && <p className="revision-card__meta">Error: {v.errorTecnico}</p>}
      </div>

      <dl className="revision-card__datos">
        <dt>Monto aprobado del crédito</dt>
        <dd>{moneda(r.montoAprobado)}</dd>
        <Capturado r={r} />
        {leido && (
          <>
            <dt>Claude leyó</dt>
            <dd>
              {leido.tipoDetectado ?? "—"} · cliente {leido.nombreCliente ?? "—"} · total{" "}
              {moneda(leido.montoTotal)} · fechas {leido.fechas?.join(", ") || "—"}
              {r.tipo === "comprobante" &&
                ` · firma ${leido.tieneFirma === true ? "sí" : leido.tieneFirma === false ? "no" : "—"}`}
            </dd>
            {leido.observaciones && (
              <>
                <dt>Observaciones</dt>
                <dd>{leido.observaciones}</dd>
              </>
            )}
          </>
        )}
      </dl>

      <label>
        Comentario para la tienda (obligatorio si rechazas)
        <input
          type="text"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej. El total no coincide con la cotización firmada"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="upload-form__actions">
        <button
          type="button"
          className="button-secondary"
          disabled={enviando !== null}
          onClick={() => resolver("rechazar")}
        >
          {enviando === "rechazar" ? "Rechazando..." : "Rechazar"}
        </button>
        <button type="button" disabled={enviando !== null} onClick={() => resolver("aprobar")}>
          {enviando === "aprobar" ? "Aprobando..." : "Aprobar"}
        </button>
      </div>
    </article>
  );
}

/**
 * Bandeja de los documentos que la verificación automática no pudo dar por
 * buenos. Aprobar uno lo aplica igual que si hubiera pasado solo (HubSpot
 * y el paso en "completado"); rechazarlo le muestra a la tienda el
 * comentario para que suba otro.
 */
export function RevisionPage() {
  const [revisiones, setRevisiones] = useState<RevisionPendiente[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      setRevisiones((await adminListRevisionesCallable()).data.revisiones);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las revisiones.");
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  if (error && !revisiones) return <p className="page-message page-message--error">{error}</p>;
  if (!revisiones) return <p className="page-message">Cargando revisiones...</p>;

  return (
    <section>
      <h1 className="admin-title">Revisión de documentos</h1>
      <p className="admin-subtitle">
        Cotizaciones y comprobantes en los que la verificación automática
        encontró algo que no cuadra. Hasta que los apruebes, la tienda los ve
        “En revisión” y el paso no cuenta como completado.
      </p>
      {error && <p className="form-error">{error}</p>}
      {revisiones.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No hay documentos en revisión</p>
        </div>
      ) : (
        revisiones.map((r) => (
          <Tarjeta key={`${r.dealId}-${r.tipo}`} r={r} onResuelta={cargar} />
        ))
      )}
    </section>
  );
}
