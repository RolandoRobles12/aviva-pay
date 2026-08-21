import type { PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import { completados, milestones, scopeOf, type RolloutMap } from "../lib/dealScope";
import type { SortKey, SortState } from "../lib/dealSort";

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
 * That sale closed before this store started using Paydesk, so there is
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
 * A column header that toggles sort on click. Both arrows shown faint
 * until this column is the active one, then the active direction lights
 * up — so the sortability of every column is visible without hovering,
 * which matters on a touchscreen.
 */
function SortableHeader({
  sortKey,
  children,
  sort,
  onSort,
  className,
}: {
  sortKey: SortKey;
  children: React.ReactNode;
  sort?: SortState | null;
  onSort?: (key: SortKey) => void;
  className?: string;
}) {
  if (!onSort) return <th className={className}>{children}</th>;
  const activo = sort?.key === sortKey ? sort.dir : null;
  return (
    <th className={className}>
      <button
        type="button"
        className={`sort-header${activo ? ` sort-header--${activo}` : ""}`}
        onClick={() => onSort(sortKey)}
      >
        {children}
        <span className="sort-header__arrows" aria-hidden>
          <span className="sort-header__arrow sort-header__arrow--up">▲</span>
          <span className="sort-header__arrow sort-header__arrow--down">▼</span>
        </span>
      </button>
    </th>
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
  rolloutPorTienda = {},
  concesionarioNombres,
  sort,
  onSort,
  onUploadCotizacion,
  onUploadComprobante,
}: {
  deals: PayDeskDeal[];
  /** From the admin's Etiquetas config. Falls back to DEFAULT_LABELS for any missing key. */
  labels?: FieldLabels;
  /** Rollout cutoff per store. Deals approved before their store's cutoff are shown but never demanded. */
  rolloutPorTienda?: RolloutMap;
  /**
   * concesionarioId → store name. A signed-in user can have more than one
   * store, so the list is a combined view across all of them — the
   * "Tienda" column (and its ability to distinguish rows) only earns its
   * place once there's more than one to distinguish. Omit for the
   * single-store admin preview, which doesn't need it.
   */
  concesionarioNombres?: Record<string, string>;
  /** Current sort, or null/omitted for none. Pass alongside onSort to make headers clickable. */
  sort?: SortState | null;
  /** Sorting the *unpaginated* set is the caller's job — this only reports which column was clicked. Omit both to render plain, unsortable headers. */
  onSort?: (key: SortKey) => void;
  /** Omit both to render a read-only table (no upload buttons) — used by the admin preview. */
  onUploadCotizacion?: (dealId: string) => void;
  onUploadComprobante?: (dealId: string) => void;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const mostrarTienda = Object.keys(concesionarioNombres ?? {}).length > 1;

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
            <SortableHeader sortKey="cliente" sort={sort} onSort={onSort} className="col-sticky">
              {l.cliente}
            </SortableHeader>
            {mostrarTienda && (
              <SortableHeader sortKey="tienda" sort={sort} onSort={onSort}>
                Tienda
              </SortableHeader>
            )}
            <SortableHeader sortKey="avance" sort={sort} onSort={onSort}>
              Avance
            </SortableHeader>
            <SortableHeader sortKey="fechaSolicitud" sort={sort} onSort={onSort}>
              {l.fechaSolicitud}
            </SortableHeader>
            <SortableHeader sortKey="montoAprobado" sort={sort} onSort={onSort} className="col-num">
              {l.montoAprobado}
            </SortableHeader>
            <SortableHeader sortKey="estatusKyc" sort={sort} onSort={onSort}>
              {l.estatusKyc}
            </SortableHeader>
            <SortableHeader sortKey="cotizacion" sort={sort} onSort={onSort}>
              {l.cotizacionEstatus}
            </SortableHeader>
            <SortableHeader sortKey="creditoLiberadoFecha" sort={sort} onSort={onSort}>
              {l.creditoLiberadoFecha}
            </SortableHeader>
            <SortableHeader sortKey="disposicionCreditoFecha" sort={sort} onSort={onSort}>
              {l.disposicionCreditoFecha}
            </SortableHeader>
            <SortableHeader sortKey="comprobante" sort={sort} onSort={onSort}>
              {l.comprobanteEntregaEstatus}
            </SortableHeader>
            <SortableHeader sortKey="desembolsoFecha" sort={sort} onSort={onSort}>
              {l.desembolsoFecha}
            </SortableHeader>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => {
            const historica = scopeOf(deal, rolloutPorTienda) === "historica";
            return (
            <tr key={deal.dealId} className={historica ? "row--historica" : undefined}>
              <td className="col-sticky cell-cliente">
                {deal.cliente ?? "—"}
                {historica && (
                  <span
                    className="tag-historica"
                    title="Cerró antes de que tu tienda empezara a usar Paydesk — no tienes que subir nada."
                  >
                    Anterior
                  </span>
                )}
              </td>
              {mostrarTienda && (
                <td className="cell-tienda">
                  {(deal.concesionarioId && concesionarioNombres?.[deal.concesionarioId]) ?? "—"}
                </td>
              )}
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
