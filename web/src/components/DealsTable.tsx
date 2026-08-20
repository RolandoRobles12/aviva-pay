import type { PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import { completados, milestones, scopeOf } from "../lib/dealScope";

/** Used until the real labels (fetched from the admin's Etiquetas config) arrive, and for any key it doesn't cover. */
const DEFAULT_LABELS: FieldLabels = {
  cliente: "Cliente",
  fechaSolicitud: "Fecha de solicitud",
  montoAprobado: "Monto aprobado",
  estatusKyc: "Estatus de KYC",
  cotizacionEstatus: "Cotización",
  creditoLiberadoFecha: "Crédito liberado",
  disposicionCreditoFecha: "Disposición del crédito",
  comprobanteEntregaEstatus: "Comprobante de entrega",
  desembolsoFecha: "Desembolso del crédito",
};

/** Short form for inside a cell — the full date is on the row's title attribute. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  return amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const TOTAL_MILESTONES = milestones({} as PayDeskDeal).length;

/** Segmented bar: one segment per milestone, filled left to right. Labelled in text beside it, never color alone. */
function ProgressMeter({ deal }: { deal: PayDeskDeal }) {
  const done = completados(deal);
  const completo = done === TOTAL_MILESTONES;
  return (
    <div className="progress" title={`${done} de ${TOTAL_MILESTONES} etapas completadas`}>
      <div
        className="progress__track"
        role="img"
        aria-label={`${done} de ${TOTAL_MILESTONES} etapas completadas`}
      >
        {Array.from({ length: TOTAL_MILESTONES }, (_, i) => (
          <span
            key={i}
            className={`progress__seg${i < done ? " progress__seg--on" : ""}${
              completo ? " progress__seg--complete" : ""
            }`}
          />
        ))}
      </div>
      <span className="progress__count">
        {done}/{TOTAL_MILESTONES}
      </span>
    </div>
  );
}

/** Milestone date columns: a dated "listo" pill once HubSpot reports it, muted "Pendiente" until then. */
function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="cell-pending">Pendiente</span>;
  return (
    <span className="cell-done">
      <span className="cell-done__check" aria-hidden>
        ✓
      </span>
      {formatDate(iso)}
    </span>
  );
}

/**
 * Cotización / Comprobante columns: a dated pill once uploaded, otherwise
 * the action that uploads it.
 *
 * On a historical deal the ask is deliberately demoted to a quiet link.
 * That sale closed before this store started using Pay Desk, so there is
 * nothing left to upload and a green call-to-action would read as a chore
 * the store can never finish — but uploading stays *possible*, since the
 * cutoff governs what's demanded, not what's allowed.
 */
function UploadCell({
  estatus,
  dateIso,
  onUpload,
  ctaLabel,
  historica,
}: {
  estatus: "pendiente" | "completado";
  dateIso: string | null;
  onUpload?: () => void;
  ctaLabel: string;
  historica: boolean;
}) {
  if (estatus === "completado") {
    return (
      <span className="cell-done">
        <span className="cell-done__check" aria-hidden>
          ✓
        </span>
        {formatDate(dateIso)}
      </span>
    );
  }
  if (!onUpload) return <span className="cell-pending">Pendiente</span>;
  if (historica) {
    return (
      <button type="button" className="link-button link-button--muted" onClick={onUpload}>
        Subir si aplica
      </button>
    );
  }
  return (
    <button type="button" className="upload-button" onClick={onUpload}>
      <span aria-hidden>↑</span> {ctaLabel}
    </button>
  );
}

/**
 * Tabla de estatus (sección 5.1): una fila por solicitud (deal) del
 * concesionario. Cada fila que tenga cotización o comprobante pendiente
 * expone un botón que abre el modal correspondiente para ese deal.
 *
 * Nine columns don't fit most screens, so the table scrolls sideways with
 * the client's name pinned — that name is what a store navigates by, and
 * losing it mid-scroll made the other columns unreadable.
 */
export function DealsTable({
  deals,
  labels,
  rolloutDesde = null,
  onUploadCotizacion,
  onUploadComprobante,
}: {
  deals: PayDeskDeal[];
  /** From the admin's Etiquetas config. Falls back to DEFAULT_LABELS for any missing key. */
  labels?: FieldLabels;
  /** This store's rollout cutoff. Deals approved before it are shown but never demanded. */
  rolloutDesde?: string | null;
  /** Omit both to render a read-only table (no upload buttons) — used by the admin preview. */
  onUploadCotizacion?: (dealId: string) => void;
  onUploadComprobante?: (dealId: string) => void;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };

  if (deals.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon" aria-hidden>
          📋
        </span>
        <p className="empty-state__title">Nada que mostrar aquí</p>
        <p className="empty-state__hint">
          No hay solicitudes que coincidan. Prueba con otro filtro, o espera a
          que Aviva registre los créditos de tus clientes.
        </p>
      </div>
    );
  }

  return (
    <div className="deals-table-wrapper">
      <table className="deals-table">
        <thead>
          <tr>
            <th className="col-sticky">{l.cliente}</th>
            <th>Avance</th>
            <th>{l.fechaSolicitud}</th>
            <th className="col-num">{l.montoAprobado}</th>
            <th>{l.estatusKyc}</th>
            <th>{l.cotizacionEstatus}</th>
            <th>{l.creditoLiberadoFecha}</th>
            <th>{l.disposicionCreditoFecha}</th>
            <th>{l.comprobanteEntregaEstatus}</th>
            <th>{l.desembolsoFecha}</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => {
            const historica = scopeOf(deal, rolloutDesde) === "historica";
            return (
            <tr key={deal.dealId} className={historica ? "row--historica" : undefined}>
              <td className="col-sticky cell-cliente">
                {deal.cliente ?? "—"}
                {historica && (
                  <span
                    className="tag-historica"
                    title="Cerró antes de que tu tienda empezara a usar Pay Desk — no tienes que subir nada."
                  >
                    Anterior
                  </span>
                )}
              </td>
              <td>
                <ProgressMeter deal={deal} />
              </td>
              <td>{formatDate(deal.fechaSolicitud)}</td>
              <td className="col-num">{formatCurrency(deal.montoAprobado)}</td>
              <td>
                <DateCell iso={deal.estatusKyc} />
              </td>
              <td>
                <UploadCell
                  estatus={deal.cotizacionEstatus}
                  dateIso={deal.cotizacionFechaEntregaAcordada}
                  ctaLabel="Subir cotización"
                  historica={historica}
                  onUpload={
                    onUploadCotizacion
                      ? () => onUploadCotizacion(deal.dealId)
                      : undefined
                  }
                />
              </td>
              <td>
                <DateCell iso={deal.creditoLiberadoFecha} />
              </td>
              <td>
                <DateCell iso={deal.disposicionCreditoFecha} />
              </td>
              <td>
                <UploadCell
                  estatus={deal.comprobanteEntregaEstatus}
                  dateIso={deal.comprobanteFechaEntrega}
                  ctaLabel="Subir comprobante"
                  historica={historica}
                  onUpload={
                    onUploadComprobante
                      ? () => onUploadComprobante(deal.dealId)
                      : undefined
                  }
                />
              </td>
              <td>
                <DateCell iso={deal.desembolsoFecha} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
