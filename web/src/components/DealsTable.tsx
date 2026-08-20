import type { PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";

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

/**
 * The seven milestones a solicitud passes through, in order. Drives the
 * per-row progress meter: a store can see at a glance how far along a
 * client is without reading across nine columns.
 */
function milestonesCompletados(deal: PayDeskDeal): number {
  return [
    deal.fechaSolicitud,
    deal.estatusKyc,
    deal.cotizacionEstatus === "completado" ? "x" : null,
    deal.creditoLiberadoFecha,
    deal.disposicionCreditoFecha,
    deal.comprobanteEntregaEstatus === "completado" ? "x" : null,
    deal.desembolsoFecha,
  ].filter(Boolean).length;
}

const TOTAL_MILESTONES = 7;

/** Segmented bar: one segment per milestone, filled left to right. Labelled in text beside it, never color alone. */
function ProgressMeter({ deal }: { deal: PayDeskDeal }) {
  const done = milestonesCompletados(deal);
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

/** Cotización / Comprobante columns: dated pill once uploaded, or the action that uploads it. */
function UploadCell({
  estatus,
  dateIso,
  onUpload,
  ctaLabel,
}: {
  estatus: "pendiente" | "completado";
  dateIso: string | null;
  onUpload?: () => void;
  ctaLabel: string;
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
  onUploadCotizacion,
  onUploadComprobante,
}: {
  deals: PayDeskDeal[];
  /** From the admin's Etiquetas config. Falls back to DEFAULT_LABELS for any missing key. */
  labels?: FieldLabels;
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
        <p className="empty-state__title">Todavía no hay solicitudes</p>
        <p className="empty-state__hint">
          Aquí van a aparecer los créditos de tus clientes conforme Aviva los
          registre. No tienes que hacer nada por ahora.
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
          {deals.map((deal) => (
            <tr key={deal.dealId}>
              <td className="col-sticky cell-cliente">{deal.cliente ?? "—"}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
