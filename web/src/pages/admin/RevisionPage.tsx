import { useEffect, useState } from "react";
import {
  adminListRevisionesCallable,
  adminResolverRevisionCallable,
  type RevisionPendiente,
} from "../../lib/firebase";
import { ArchivoLink } from "../../components/ArchivoLink";
import {
  Badge,
  Card,
  Cargando,
  Detalles,
  EmptyState,
  Field,
  MensajeInline,
  Notice,
  PageHeader,
} from "../../components/admin/ui";

const TIPO: Record<RevisionPendiente["tipo"], string> = {
  cotizacion: "Cotización",
  comprobante: "Comprobante de entrega",
};

/** Lo que Claude dice que es el documento, en palabras. */
const TIPO_DETECTADO: Record<string, string> = {
  cotizacion: "Cotización",
  factura: "Factura",
  nota_de_venta: "Nota de venta",
  comprobante_de_entrega: "Comprobante de entrega",
  nota_de_remision: "Nota de remisión",
  otro_documento: "Otro documento",
  no_es_documento: "No es un documento",
};

function moneda(n: number | null | undefined): string {
  return n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function haceCuanto(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function Tarjeta({ r, onResuelta }: { r: RevisionPendiente; onResuelta: (texto: string) => void }) {
  const [rechazando, setRechazando] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState<"aprobar" | "rechazar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v = r.verificacion;
  const leido = v?.datos;
  const c = r.revision.capturado;
  const noVerificado = !v || v.estado === "no-verificado";

  async function resolver(decision: "aprobar" | "rechazar") {
    if (decision === "rechazar" && !comentario.trim()) {
      setError("Escribe qué está mal: es lo que verá la tienda.");
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
      onResuelta(
        decision === "aprobar"
          ? `${TIPO[r.tipo]} de ${r.cliente ?? "el cliente"} aprobada.`
          : `${TIPO[r.tipo]} de ${r.cliente ?? "el cliente"} rechazada; la tienda verá tu comentario.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la decisión.");
      setEnviando(null);
    }
  }

  return (
    <Card
      titulo={
        <>
          {r.cliente ?? "Sin nombre"} <Badge tono="neutro">{TIPO[r.tipo]}</Badge>
          {r.revision.solicitudManual && <> <Badge tono="warn">Verificación manual</Badge></>}
        </>
      }
      descripcion={`${r.tienda ?? "Sin tienda"} · subido ${haceCuanto(r.revision.subidoEn)} · solicitud ${r.dealId}`}
      acciones={
        <ArchivoLink dealId={r.dealId} tipo={r.tipo} revision className="adm-btn adm-btn--secundario">
          Ver documento
        </ArchivoLink>
      }
      pie={
        rechazando ? undefined : (
          <>
            {error && <MensajeInline ok={false}>{error}</MensajeInline>}
            <button
              type="button"
              className="adm-btn adm-btn--peligro"
              disabled={enviando !== null}
              onClick={() => setRechazando(true)}
            >
              Rechazar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primario"
              disabled={enviando !== null}
              onClick={() => resolver("aprobar")}
            >
              {enviando === "aprobar" ? "Aprobando..." : "Aprobar"}
            </button>
          </>
        )
      }
    >
      {r.revision.solicitudManual && (
        <Notice tono="info" titulo="La tienda pidió verificación manual">
          La verificación automática rechazó este documento varias veces seguidas y la tienda
          cree que es correcto. Revísalo tú: abajo está lo que encontró la verificación.
        </Notice>
      )}
      <Notice tono="warn" titulo={noVerificado ? "No se pudo verificar automáticamente" : "Por qué está en revisión"}>
        {v && v.motivos.length > 0 ? (
          <ul>
            {v.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p>Revisa el documento y decide si es válido.</p>
        )}
      </Notice>

      <div className="adm-compara">
        <div className="adm-compara__col">
          <h3>Lo que capturó la tienda</h3>
          <dl className="adm-datos">
            <dt>Crédito aprobado</dt>
            <dd>{moneda(r.montoAprobado)}</dd>
            {r.tipo === "cotizacion" ? (
              <>
                <dt>Total de la compra</dt>
                <dd>{moneda(c.montoTotalCompra ? Number(c.montoTotalCompra) : null)}</dd>
                <dt>Entrega acordada</dt>
                <dd>{fechaCorta(c.fechaEntregaAcordada)}</dd>
              </>
            ) : (
              <>
                <dt>Fecha de entrega</dt>
                <dd>{fechaCorta(c.fechaEntrega)}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="adm-compara__col">
          <h3>Lo que dice el documento</h3>
          {leido ? (
            <dl className="adm-datos">
              <dt>Tipo</dt>
              <dd>{TIPO_DETECTADO[leido.tipoDetectado ?? ""] ?? leido.tipoDetectado ?? "—"}</dd>
              <dt>Cliente</dt>
              <dd>{leido.nombreCliente ?? "—"}</dd>
              {r.tipo === "cotizacion" ? (
                <>
                  <dt>Total</dt>
                  <dd>{moneda(leido.montoTotal)}</dd>
                </>
              ) : (
                <>
                  <dt>Firma del cliente</dt>
                  <dd>{leido.tieneFirma === true ? "Sí" : leido.tieneFirma === false ? "No se ve" : "—"}</dd>
                </>
              )}
              <dt>Fechas</dt>
              <dd>{leido.fechas?.length ? leido.fechas.map(fechaCorta).join(", ") : "—"}</dd>
            </dl>
          ) : (
            <p className="adm-field__ayuda">Sin lectura automática. Abre el documento para revisarlo.</p>
          )}
          {leido?.observaciones && <p className="adm-field__ayuda">{leido.observaciones}</p>}
        </div>
      </div>

      {v?.errorTecnico && (
        <Detalles>
          <p className="adm-mono">{v.errorTecnico}</p>
        </Detalles>
      )}

      {rechazando && (
        <div className="adm-card__pie" style={{ display: "block" }}>
          <Field
            label="¿Qué está mal? La tienda verá este mensaje"
            htmlFor={`comentario-${r.dealId}-${r.tipo}`}
            ayuda="Sé concreto, para que sepa qué subir. Ej.: “El total no coincide con la cotización firmada”."
          >
            <textarea
              id={`comentario-${r.dealId}-${r.tipo}`}
              rows={2}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="adm-page-head__acciones" style={{ justifyContent: "flex-end" }}>
            {error && <MensajeInline ok={false}>{error}</MensajeInline>}
            <button
              type="button"
              className="adm-btn adm-btn--secundario"
              disabled={enviando !== null}
              onClick={() => {
                setRechazando(false);
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--peligro"
              disabled={enviando !== null}
              onClick={() => resolver("rechazar")}
            >
              {enviando === "rechazar" ? "Rechazando..." : "Rechazar documento"}
            </button>
          </div>
        </div>
      )}
    </Card>
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
  const [aviso, setAviso] = useState<string | null>(null);

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

  return (
    <section>
      <PageHeader
        titulo="Revisión de documentos"
        descripcion="Documentos en los que la verificación automática encontró algo que no cuadra. Mientras no los resuelvas, la tienda los ve “En revisión”."
      />
      {aviso && <Notice tono="ok">{aviso}</Notice>}
      {error && <Notice tono="error">{error}</Notice>}
      {revisiones === null && !error && <Cargando texto="Cargando documentos..." />}
      {revisiones?.length === 0 && (
        <EmptyState titulo="No hay documentos por revisar">
          Cuando la verificación automática encuentre algo raro, aparecerá aquí.
        </EmptyState>
      )}
      {revisiones?.map((r) => (
        <Tarjeta
          key={`${r.dealId}-${r.tipo}`}
          r={r}
          onResuelta={(texto) => {
            setAviso(texto);
            cargar();
          }}
        />
      ))}
    </section>
  );
}
