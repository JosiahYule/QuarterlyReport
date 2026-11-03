import React from "react";
import { asOfLabel } from "../lib/quarterProgress.js";

// Says plainly, at the top of a report, that its figures stop part way through
// the quarter. Without it the only sign was a row of red deltas.
//
// Renders nothing for a finished quarter, so a complete report looks exactly
// as it always has.
export function QuarterProgress({ coverage }) {
  if (!coverage || coverage.complete) return null;
  const pct = Math.round(coverage.fraction * 100);
  return (
    <div className="hero-b-progress trends-progress">
      <span className="trends-pct-label">
        In progress · figures to {asOfLabel(coverage)} · {pct}% of the quarter
      </span>
      <span
        className="hero-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Figures cover ${pct}% of the quarter`}
      >
        <span className="hero-progress-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
