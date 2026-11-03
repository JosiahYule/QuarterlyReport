// Signed percentage badge. `invertGood` is for "lower is better" metrics
// (bounce rate, CPC): the sign stays literal — a drop still reads "−" —
// but the color flips so a drop shows as good (green) and a rise as bad.
//
// `paced` marks a comparison made at a partial quarter's pace rather than on
// its raw figure (see lib/quarterProgress.js), so a screen reader hears the
// same qualification the visible "on pace for" note gives everyone else.
export function Delta({ d, className = "", invertGood = false, paced = false }) {
  if (!d) return null;
  const label = d.dir === "up" ? "increased" : d.dir === "down" ? "decreased" : "unchanged";
  const tone = !invertGood || d.dir === "flat" ? d.dir : d.dir === "up" ? "down" : "up";
  const spoken = paced
    ? `on pace, ${label} ${d.pct.toFixed(1)} percent`
    : `${label} ${d.pct.toFixed(1)} percent`;
  return (
    <span className={`delta ${tone} ${className}`} aria-label={spoken}>
      <span>
        {d.dir === "up" ? "+" : d.dir === "down" ? "−" : ""}
        {d.pct.toFixed(1)}%
      </span>
    </span>
  );
}
