export function Delta({ d, className = "" }) {
  if (!d) return null;
  const label = d.dir === "up" ? "increased" : d.dir === "down" ? "decreased" : "unchanged";
  return (
    <span
      className={`delta ${d.dir} ${className}`}
      aria-label={`${label} ${d.pct.toFixed(1)} percent`}
    >
      <span>{d.dir === "up" ? "+" : d.dir === "down" ? "−" : ""}{d.pct.toFixed(1)}%</span>
    </span>
  );
}
