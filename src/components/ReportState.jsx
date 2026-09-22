import React from "react";
import { PageLoader } from "./PageLoader.jsx";
import { resolveQuarter, VIEW_LABELS } from "../config.js";

// Every report page opens the same way: bail out with an error, an
// unpublished-quarter notice, or a skeleton, and only then render itself.
// That block was duplicated verbatim across Social, Web and Paid, differing
// by a single word, so it lives here once.
//
// Returns the screen to show instead of the page, or null when the page
// should render normally. Pages keep their early-return shape, which matters
// because they derive values from `data` straight afterwards.
export function reportState({
  status,
  error,
  data,
  view,
  onRetry,
  errorHeading,
  hasEmptyState = true,
  quarter,
  agency,
  published,
}) {
  if (status === "error") {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">
              {errorHeading ?? (
                <>
                  Unable to load <em>report</em>
                </>
              )}
            </h2>
          </header>
          <div className="error-section" role="alert">
            <p>{error}</p>
            <button className="error-retry-btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  }

  // Trends spans quarters rather than belonging to one, so it has no
  // "not published yet" state — missing data there just means keep waiting.
  if (hasEmptyState && status === "ready" && !data) {
    // Naming the quarter is the whole point. "The selected quarter" reads as a
    // fault in the report; "Q1 (Sep–Nov 2026)" makes it obvious at a glance
    // when you are looking at a different quarter from the one you just typed
    // into the admin — which is easy to do right after a fiscal year turns
    // over, when the current quarter is days old and empty by definition.
    const q = resolveQuarter(quarter);
    const label = VIEW_LABELS[view] || "report";
    const elsewhere = (published || []).filter((p) => p.suffix !== q.suffix);

    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">
              Nothing here <em>yet</em>
            </h2>
          </header>
          <div className="error-section">
            <p>
              There’s no {label} report for{" "}
              <strong>
                {q.label} ({q.rangeLabel})
              </strong>{" "}
              yet.
            </p>
            {elsewhere.length > 0 && (
              <>
                <p className="empty-jump-label">Published quarters:</p>
                <div className="empty-jump">
                  {elsewhere.map((p) => (
                    <a
                      key={p.suffix}
                      className="empty-jump-link"
                      href={`?agency=${agency}&quarter=${p.suffix}&view=${view}`}
                    >
                      {p.label} · {p.rangeLabel}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (!data) return <PageLoader view={view} />;

  return null;
}
