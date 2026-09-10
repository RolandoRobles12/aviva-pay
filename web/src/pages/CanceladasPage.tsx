import { useOutletContext } from "react-router-dom";
import type { PayDeskDeal } from "../types/deal";
import type { FieldLabels } from "../types/admin";

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Qué alcanzó a pasar con el vale, dicho para el mostrador.
 *
 * Esta columna existe porque la expiración no tiene etapa propia en
 * HubSpot: Paydesk no puede decir "se canceló" contra "expiró" sin
 * inventárselo. Pero sí sabe si el cliente llegó a presentarse, que es
 * más útil — y es lo que la tienda necesita para saber qué decirle.
 */
const VALE: Record<
  NonNullable<PayDeskDeal["valeResumen"]>,
  { etiqueta: string; tono: "neutro" | "ambar" | "verde"; ayuda: string }
> = {
  "nunca-leido": {
    etiqueta: "El cliente no llegó",
    tono: "neutro",
    ayuda: "Su código nunca se escaneó en ninguna caja.",
  },
  "leido-sin-usar": {
    etiqueta: "Llegó, no se completó",
    tono: "ambar",
    ayuda: "Su código sí se leyó, pero nadie confirmó la disposición.",
  },
  utilizado: {
    // Ámbar, no verde: verde diría "todo bien" del único caso de esta
    // lista donde ya hay material fuera de la tienda y el crédito que lo
    // respaldaba después se canceló. Eso es una conversación con Aviva.
    etiqueta: "Alcanzó a usarlo",
    tono: "ambar",
    ayuda:
      "Se entregó material antes de que el crédito se cancelara. Repórtalo a Aviva.",
  },
  "sin-vale": {
    etiqueta: "Sin código emitido",
    tono: "neutro",
    ayuda: "El crédito se canceló antes de liberarse.",
  },
};

interface Contexto {
  deals: PayDeskDeal[];
  concesionarioNombres: Record<string, string>;
  labels: FieldLabels;
}

/**
 * Las solicitudes que ya no van a ningún lado: canceladas por Aviva, o
 * expiradas porque el cliente nunca las usó.
 *
 * Viven aparte y no como un filtro más porque no comparten columnas con
 * la lista viva: una solicitud muerta no tiene barra de avance ni
 * documentos por subir, y enseñárselos sugiere trabajo que ya no existe.
 * Pero tampoco desaparecen — una fila que se esfuma sin explicación se
 * lee como un error del sistema y termina en una llamada a soporte.
 */
export function CanceladasPage() {
  const { deals, concesionarioNombres } = useOutletContext<Contexto>();

  const canceladas = deals
    .filter((d) => d.cancelado)
    .sort((a, b) => (b.canceladoFecha ?? "").localeCompare(a.canceladoFecha ?? ""));

  const variasTiendas = Object.keys(concesionarioNombres ?? {}).length > 1;

  if (canceladas.length === 0) {
    return (
      <p className="page-message">
        No tienes solicitudes canceladas ni expiradas.
      </p>
    );
  }

  return (
    <section className="canceladas">
      <p className="canceladas__intro">
        Estas solicitudes ya no van a ningún lado: Aviva canceló el crédito, o
        expiró sin que el cliente lo usara. <strong>Su código ya no sirve</strong>{" "}
        y no hay nada que subir. Si un cliente pregunta, tiene que solicitar de
        nuevo.
      </p>

      <div className="deals-table-wrapper">
        <table className="deals-table">
          <thead>
            <tr>
              <th>Cliente</th>
              {variasTiendas && <th>Tienda</th>}
              <th className="col-num">Monto aprobado</th>
              <th>Fecha de solicitud</th>
              <th>Se canceló</th>
              <th>Qué pasó</th>
            </tr>
          </thead>
          <tbody>
            {canceladas.map((deal) => {
              const vale = deal.valeResumen ? VALE[deal.valeResumen] : null;
              return (
                <tr key={deal.dealId}>
                  <td className="cell-cliente">{deal.cliente ?? "—"}</td>
                  {variasTiendas && (
                    <td className="cell-tienda">
                      {(deal.concesionarioId &&
                        concesionarioNombres?.[deal.concesionarioId]) ?? "—"}
                    </td>
                  )}
                  <td className="col-num">
                    {deal.montoAprobado === null
                      ? "—"
                      : moneda.format(deal.montoAprobado)}
                  </td>
                  <td>{fecha(deal.fechaSolicitud)}</td>
                  <td>{fecha(deal.canceladoFecha)}</td>
                  <td>
                    {vale ? (
                      <div className="canceladas__que-paso">
                        <span className={`vale-chip vale-chip--${vale.tono}`}>
                          {vale.etiqueta}
                        </span>
                        <span className="canceladas__ayuda">{vale.ayuda}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
