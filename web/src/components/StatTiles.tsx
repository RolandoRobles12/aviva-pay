export interface Stat {
  label: string;
  value: string;
  /** Highlights the tile when there's something to act on (e.g. pending uploads > 0). Never the only signal — the label always says what it is. */
  tone?: "neutral" | "accion";
}

/**
 * KPI row: the handful of numbers that answer "what do I need to do
 * today?" before the store reads a single table row.
 *
 * No sparklines or deltas — these are current counts, not trends, and a
 * stat tile with nothing to plot is the right form for that.
 */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="stat-tiles">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`stat-tile${s.tone === "accion" ? " stat-tile--accion" : ""}`}
        >
          <span className="stat-tile__label">{s.label}</span>
          <span className="stat-tile__value">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
