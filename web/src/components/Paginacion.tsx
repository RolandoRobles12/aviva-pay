export const POR_PAGINA = 25;

/**
 * Prev/next with a plain "showing X–Y of Z" count. No numbered pages: a
 * store with 300 clients navigates by filtering and searching, not by
 * jumping to page 9, and a long strip of page numbers is a row of tiny
 * tap targets on a phone.
 */
export function Paginacion({
  total,
  pagina,
  onPagina,
}: {
  total: number;
  /** Zero-based. */
  pagina: number;
  onPagina: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (total <= POR_PAGINA) return null;

  const primero = pagina * POR_PAGINA + 1;
  const ultimo = Math.min(total, (pagina + 1) * POR_PAGINA);

  return (
    <nav className="paginacion" aria-label="Paginación de clientes">
      <span className="paginacion__rango">
        {primero.toLocaleString("es-MX")}–{ultimo.toLocaleString("es-MX")} de{" "}
        {total.toLocaleString("es-MX")}
      </span>
      <div className="paginacion__controles">
        <button
          type="button"
          className="chip chip--sm"
          disabled={pagina === 0}
          onClick={() => onPagina(pagina - 1)}
        >
          ← Anterior
        </button>
        <span className="paginacion__pagina">
          Página {pagina + 1} de {paginas}
        </span>
        <button
          type="button"
          className="chip chip--sm"
          disabled={pagina >= paginas - 1}
          onClick={() => onPagina(pagina + 1)}
        >
          Siguiente →
        </button>
      </div>
    </nav>
  );
}
