// Signed percentage badge. `invertGood` is for "lower is better" metrics
// (bounce rate, CPC): the sign stays literal — a drop still reads "−" —
// but the color flips so a drop shows as good (green) and a rise as bad.
export function Delta({ d, className = "", invertGood = false }) {
  if (!d) return null;
  const label = d.dir === "up" ? "increased" : d.dir === "down" ? "decreased" : "unchanged";
  const tone = !invertGood || d.dir === "flat"
    ? d.dir
    : d.dir === "up" ? "down" : "up";
  return (
    <span
      className={`delta ${tone} ${className}`}
      aria-label={`${label} ${d.pct.toFixed(1)} percent`}
    >
      <span>{d.dir === "up" ? "+" : d.dir === "down" ? "−" : ""}{d.pct.toFixed(1)}%</span>
    </span>
  );
}
