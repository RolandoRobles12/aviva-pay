/**
 * Gráficas sencillas del panel, en HTML y CSS (sin librería): barras
 * horizontales para rankings y embudos, y columnas para el tiempo. Todas
 * son de una sola serie — un solo color, sin leyenda: el título dice qué
 * es — y cada barra dice su valor al pasar el cursor y en texto junto a
 * ella, para que nada dependa solo del color. Estilos en styles/admin.css
 * (sección "Uso del portal").
 */

export function BarrasHorizontales({
  filas,
  formato = (v) => v.toLocaleString("es-MX"),
  tono = "verde",
  vacio = "Sin datos en este periodo.",
}: {
  filas: { etiqueta: string; valor: number; detalle?: string }[];
  formato?: (v: number) => string;
  tono?: "verde" | "ambar";
  vacio?: string;
}) {
  if (filas.length === 0) return <p className="adm-field__ayuda">{vacio}</p>;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className={`uso-barras uso-barras--${tono}`}>
      {filas.map((f) => (
        <li key={f.etiqueta} title={`${f.etiqueta}: ${formato(f.valor)}${f.detalle ? ` · ${f.detalle}` : ""}`}>
          <span className="uso-barras__etiqueta">{f.etiqueta}</span>
          <span className="uso-barras__pista">
            <span className="uso-barras__barra" style={{ width: `${(f.valor / max) * 100}%` }} />
          </span>
          <span className="uso-barras__valor">
            {formato(f.valor)}
            {f.detalle && <span className="uso-barras__detalle"> {f.detalle}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Embudo: cada paso con su número y el % que llegó desde el primero. */
export function Embudo({ pasos }: { pasos: { paso: string; intentos: number }[] }) {
  const total = pasos[0]?.intentos ?? 0;
  if (total === 0) return <p className="adm-field__ayuda">Nadie lo intentó en este periodo.</p>;
  return (
    <BarrasHorizontales
      filas={pasos.map((p) => ({
        etiqueta: p.paso,
        valor: p.intentos,
        detalle: `(${Math.round((p.intentos / total) * 100)}%)`,
      }))}
    />
  );
}

/** Columnas verticales (por día, por hora). Etiquetas del eje solo cada `cadaEtiqueta`. */
export function Columnas({
  columnas,
  formato = (v) => v.toLocaleString("es-MX"),
  cadaEtiqueta = 1,
  vacio = "Sin uso en este periodo.",
}: {
  columnas: { etiqueta: string; valor: number; titulo?: string }[];
  formato?: (v: number) => string;
  cadaEtiqueta?: number;
  vacio?: string;
}) {
  const max = Math.max(...columnas.map((c) => c.valor), 0);
  if (columnas.length === 0 || max === 0) return <p className="adm-field__ayuda">{vacio}</p>;
  return (
    <div className="uso-columnas" role="img" aria-label="Gráfica de columnas">
      <span className="uso-columnas__max">{formato(max)}</span>
      <div className="uso-columnas__area">
        {columnas.map((c) => (
          <div key={c.etiqueta} className="uso-columnas__col" title={`${c.titulo ?? c.etiqueta}: ${formato(c.valor)}`}>
            <span className="uso-columnas__barra" style={{ height: `${(c.valor / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="uso-columnas__eje">
        {columnas.map((c, i) => (
          <span key={c.etiqueta}>{i % cadaEtiqueta === 0 ? c.etiqueta : ""}</span>
        ))}
      </div>
    </div>
  );
}

export function minutosLegibles(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 90) return `${Math.round(min)} min`;
  const h = min / 60;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
}
