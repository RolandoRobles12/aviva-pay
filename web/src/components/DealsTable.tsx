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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  return amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/** Plain date columns: a checkmark + date once HubSpot reports it, "Pendiente" until then. */
function DateCell({ iso, pendingLabel }: { iso: string | null; pendingLabel: string }) {
  if (!iso) return <span className="cell-pending">{pendingLabel}</span>;
  return (
    <span className="cell-done">
      {formatDate(iso)} <span aria-hidden>✅</span>
    </span>
  );
}

/** Cotización / Comprobante columns: date once completed, or a button to open the upload modal. */
function UploadCell({
  estatus,
  dateIso,
  onUpload,
}: {
  estatus: "pendiente" | "completado";
  dateIso: string | null;
  onUpload?: () => void;
}) {
  if (estatus === "completado") {
    return (
      <span className="cell-done">
        {formatDate(dateIso)} <span aria-hidden>✅</span>
      </span>
    );
  }
  return (
    <div className="cell-upload">
      <span className="cell-pending">Pendiente</span>
      {onUpload && (
        <button type="button" className="upload-button" onClick={onUpload}>
          Subir archivo
        </button>
      )}
    </div>
  );
}

/**
 * Tabla de estatus (sección 5.1): una fila por solicitud (deal) del
 * concesionario. Cada fila que tenga cotización o comprobante pendiente
 * expone un botón que abre el modal correspondiente para ese deal.
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
    return <p className="page-message">Todavía no hay solicitudes registradas.</p>;
  }

  return (
    <div className="deals-table-wrapper">
      <table className="deals-table">
        <thead>
          <tr>
            <th>{l.cliente}</th>
            <th>{l.fechaSolicitud}</th>
            <th>{l.montoAprobado}</th>
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
              <td>{deal.cliente ?? "—"}</td>
              <td>{formatDate(deal.fechaSolicitud)}</td>
              <td>{formatCurrency(deal.montoAprobado)}</td>
              <td>{deal.estatusKyc ?? <span className="cell-pending">Pendiente</span>}</td>
              <td>
                <UploadCell
                  estatus={deal.cotizacionEstatus}
                  dateIso={deal.cotizacionFechaEntregaAcordada}
                  onUpload={
                    onUploadCotizacion
                      ? () => onUploadCotizacion(deal.dealId)
                      : undefined
                  }
                />
              </td>
              <td>
                <DateCell iso={deal.creditoLiberadoFecha} pendingLabel="Pendiente" />
              </td>
              <td>
                <DateCell iso={deal.disposicionCreditoFecha} pendingLabel="Pendiente" />
              </td>
              <td>
                <UploadCell
                  estatus={deal.comprobanteEntregaEstatus}
                  dateIso={deal.comprobanteFechaEntrega}
                  onUpload={
                    onUploadComprobante
                      ? () => onUploadComprobante(deal.dealId)
                      : undefined
                  }
                />
              </td>
              <td>
                <DateCell iso={deal.desembolsoFecha} pendingLabel="Pendiente" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
