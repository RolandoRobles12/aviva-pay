import type { ReactNode } from "react";
import type { PayDeskDeal } from "../types/deal";
import { StatusBadge } from "./StatusBadge";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  return amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/**
 * Main status table (section 5.1). One row, since the page is scoped to a
 * single deal — laid out as a definition list of the columns from the
 * requirement doc so it also reads well on mobile.
 */
export function StatusTable({ deal }: { deal: PayDeskDeal }) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: "Cliente", value: deal.cliente ?? "—" },
    { label: "Fecha de solicitud", value: formatDate(deal.fechaSolicitud) },
    { label: "Monto aprobado", value: formatCurrency(deal.montoAprobado) },
    { label: "Estatus de KYC", value: deal.estatusKyc ?? "—" },
    { label: "Cotización", value: <StatusBadge status={deal.cotizacionEstatus} /> },
    { label: "Crédito liberado", value: formatDate(deal.creditoLiberadoFecha) },
    { label: "Disposición del crédito", value: formatDate(deal.disposicionCreditoFecha) },
    {
      label: "Comprobante de entrega",
      value: <StatusBadge status={deal.comprobanteEntregaEstatus} />,
    },
    { label: "Desembolso del crédito", value: formatDate(deal.desembolsoFecha) },
  ];

  return (
    <dl className="status-table">
      {rows.map((row) => (
        <div className="status-table__row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
