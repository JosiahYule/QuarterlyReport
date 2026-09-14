import React from "react";
import { PageLoader } from "./PageLoader.jsx";

// Every report page opens the same way: bail out with an error, an
// unpublished-quarter notice, or a skeleton, and only then render itself.
// That block was duplicated verbatim across Social, Web and Paid, differing
// by a single word, so it lives here once.
//
// Returns the screen to show instead of the page, or null when the page
// should render normally. Pages keep their early-return shape, which matters
// because they derive values from `data` straight afterwards.
export function reportState({ status, error, data, view, onRetry, errorHeading, hasEmptyState = true }) {
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
              This report hasn’t been published for the selected quarter. Choose another quarter from the menu
              above, or check back soon.
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!data) return <PageLoader view={view} />;

  return null;
}
