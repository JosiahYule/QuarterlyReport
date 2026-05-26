import { arrow } from "../utils.js";

export function Delta({ d, className = "" }) {
  if (!d) return null;
  const label = d.dir === "up" ? "increased" : d.dir === "down" ? "decreased" : "unchanged";
  return (
    <span
      className={`delta ${d.dir} ${className}`}
      aria-label={`${label} ${d.pct.toFixed(1)} percent`}
    >
      <span className="arrow serif ital" aria-hidden="true">{arrow(d.dir)}</span>
      <span>{d.pct.toFixed(1)}%</span>
    </span>
  );
}
