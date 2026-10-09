import type { PayDeskDeal, RevisionDocumento, VerificacionDocumento } from "../types/deal";
import type { FieldLabels } from "../types/admin";
import { completados, getEtapas, scopeOf, type RolloutMap } from "../lib/dealScope";
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

/** Segmented bar: one segment per milestone, filled left to right. Labelled in text beside it, never color alone. */
function ProgressMeter({ deal }: { deal: PayDeskDeal }) {
  const TOTAL_MILESTONES = getEtapas().length;
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
/**
 * Crédito liberado es el momento en que nace el vale del cliente, así que
 * es también donde la caja lo valida: el cajero está viendo la fila de su
 * cliente y no tiene por qué irse a otra pestaña a teclear un código.
 */
function CreditoLiberadoCell({
  iso,
  onValidar,
}: {
  iso: string | null;
  onValidar?: () => void;
}) {
  if (!iso) return <span className="cell-pending">Pendiente</span>;
  return (
    <div className="cell-upload-done">
      <span className="cell-done">
        <span className="cell-done__check" aria-hidden>
          ✓
        </span>
        {formatDate(iso)}
      </span>
      {onValidar && (
        <button type="button" className="link-button link-button--muted" onClick={onValidar}>
          Validar código
        </button>
      )}
    </div>
  );
}

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
  url,
  onUpload,
  ctaLabel,
  historica,
  revision,
}: {
  estatus: "pendiente" | "completado";
  dateIso: string | null;
  /** cotizacionUrl/comprobanteUrl — the uploaded file's public URL, once completado. */
  url: string | null;
  onUpload?: () => void;
  ctaLabel: string;
  historica: boolean;
  /** Documento que espera a un administrador o que uno rechazó (solo si el paso sigue pendiente). */
  revision?: RevisionDocumento | null;
}) {
  if (estatus === "completado") {
    const pill = (
      <span className="cell-done">
        <span className="cell-done__check" aria-hidden>
          ✓
        </span>
        {formatDate(dateIso)}
      </span>
    );
    return (
      <div className="cell-upload-done">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="cell-done-link"
            title="Ver archivo"
          >
            {pill}
          </a>
        ) : (
          pill
        )}
        {onUpload && (
          <button
            type="button"
            className="link-button link-button--muted"
            onClick={onUpload}
          >
            Corregir documento
          </button>
        )}
      </div>
    );
  }
  if (revision?.estado === "pendiente") {
    return (
      <div className="cell-upload-done">
        <a
          href={revision.url}
          target="_blank"
          rel="noopener noreferrer"
          className="cell-review"
          title="El equipo de Aviva está revisando este documento"
        >
          En revisión
        </a>
        {onUpload && (
          <button type="button" className="link-button link-button--muted" onClick={onUpload}>
            Reemplazar
          </button>
        )}
      </div>
    );
  }
  const rechazo =
    revision?.estado === "rechazado" ? (
      <span className="cell-rejected" title={revision.comentario}>
        Rechazado{revision.comentario ? `: ${revision.comentario}` : ""}
      </span>
    ) : null;
  if (!onUpload) return rechazo ?? <span className="cell-pending">Pendiente</span>;
  if (rechazo) {
    return (
      <div className="cell-upload-done">
        {rechazo}
        <button type="button" className="upload-button" onClick={onUpload}>
          <span aria-hidden>↑</span> Subir otro
        </button>
      </div>
    );
  }
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

const ETIQUETA_VERIFICACION: Record<VerificacionDocumento["estado"], string> = {
  aprobado: "Verificado",
  revisar: "Revisar",
  rechazado: "No pasó la verificación",
  "no-verificado": "Sin verificar",
};

/** Solo en la vista del admin: qué dijo la verificación con Claude del documento. Los motivos van en el title. */
function VerificacionTag({ v }: { v?: VerificacionDocumento }) {
  if (!v) return null;
  const detalle = [...v.motivos, ...(v.errorTecnico ? [`Error: ${v.errorTecnico}`] : [])].join("\n");
  return (
    <span className={`tag-verificacion tag-verificacion--${v.estado}`} title={detalle || undefined}>
      {ETIQUETA_VERIFICACION[v.estado]}
    </span>
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
  onValidarCodigo,
  mostrarVerificacion = false,
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
  /** Abre la ventana de validación del vale desde la fila. Omitir para una tabla de solo lectura. */
  onValidarCodigo?: (dealId: string) => void;
  /** Vista del admin: muestra el resultado de la verificación de cada documento. La tienda no lo ve. */
  mostrarVerificacion?: boolean;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const mostrarTienda = Object.keys(concesionarioNombres ?? {}).length > 1;
  // Etapas que el admin agregó: cada una es una columna de fecha más.
  const etapasExtra = getEtapas().filter((e) => e.tipo === "personalizada");

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
            {etapasExtra.map((e) => (
              <th key={e.id}>{e.label}</th>
            ))}
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
                  revision={deal.cotizacionRevision}
                  dateIso={deal.cotizacionFechaEntregaAcordada}
                  url={deal.cotizacionUrl}
                  ctaLabel="Subir cotización"
                  historica={historica}
                  onUpload={
                    onUploadCotizacion
                      ? () => onUploadCotizacion(deal.dealId)
                      : undefined
                  }
                />
                {mostrarVerificacion && <VerificacionTag v={deal.cotizacionOcr} />}
              </td>
              <td>
                <CreditoLiberadoCell
                  iso={deal.creditoLiberadoFecha}
                  onValidar={
                    onValidarCodigo ? () => onValidarCodigo(deal.dealId) : undefined
                  }
                />
              </td>
              <td>
                <DateCell iso={deal.disposicionCreditoFecha} />
              </td>
              <td>
                <UploadCell
                  estatus={deal.comprobanteEntregaEstatus}
                  revision={deal.comprobanteRevision}
                  dateIso={deal.comprobanteFechaEntrega}
                  url={deal.comprobanteUrl}
                  ctaLabel="Subir comprobante"
                  historica={historica}
                  onUpload={
                    onUploadComprobante
                      ? () => onUploadComprobante(deal.dealId)
                      : undefined
                  }
                />
                {mostrarVerificacion && <VerificacionTag v={deal.comprobanteOcr} />}
              </td>
              <td>
                <DateCell iso={deal.desembolsoFecha} />
              </td>
              {etapasExtra.map((e) => (
                <td key={e.id}>
                  <DateCell iso={deal.etapasExtra?.[e.id] ?? null} />
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
