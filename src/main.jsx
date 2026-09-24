import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { useUrlState } from "./hooks/useUrlState.js";
import { usePublishedQuarters, resolveLandingQuarter } from "./hooks/usePublishedQuarters.js";
import { AppNav } from "./components/Nav.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { PageSkeleton } from "./components/Skeleton.jsx";
import { AGENCIES, REPORT_AUTHOR, VIEW_LABELS, resolveQuarter } from "./config.js";
import { installGlobalErrorReporting } from "./lib/monitor.js";
import { setFavicon } from "./lib/favicon.js";

installGlobalErrorReporting();

const SocialPage = lazy(() => import("./pages/SocialPage.jsx").then((m) => ({ default: m.SocialPage })));
const WebPage = lazy(() => import("./pages/WebPage.jsx").then((m) => ({ default: m.WebPage })));
const PaidPage = lazy(() => import("./pages/PaidPage.jsx").then((m) => ({ default: m.PaidPage })));
const TrendsPage = lazy(() => import("./pages/TrendsPage.jsx").then((m) => ({ default: m.TrendsPage })));
// Only the report's editor ever opens /admin, so its forms, importers and
// planner load on demand instead of riding along in every reader's download.
const AdminApp = lazy(() => import("./pages/admin/AdminApp.jsx").then((m) => ({ default: m.AdminApp })));

function App() {
  const [urlState, navigate] = useUrlState();
  const { agency, quarter, view, quarterExplicit } = urlState;
  const q = resolveQuarter(quarter);
  const agencyName = (AGENCIES[agency] || AGENCIES.isl).name;
  const viewLabel = VIEW_LABELS[view] || VIEW_LABELS.social;
  const [appReady, setAppReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announcementTimer = useRef(null);

  // Open on the most recent quarter that actually has a report.
  //
  // The calendar's current quarter is the wrong landing place for a quarterly
  // report: a quarter is written up after it closes, so for the first weeks of
  // every new one there is nothing to show. After the fiscal year turned over
  // on 1 September this stopped being a rough edge and became the default
  // experience — Q1 is days old, and a reader who had just entered Q4's
  // numbers would land on an empty Q1 and conclude the save had failed.
  //
  // Only a DEFAULTED quarter is replaced. A quarter in the URL was either
  // chosen from the menu or shared in a link, and either way it is an answer,
  // not a guess. Resolution is per view, so Website can land on its newest
  // quarter while Social lands on a later one it actually has.
  const published = usePublishedQuarters(view, agency);
  const landing = resolveLandingQuarter({ quarter, quarterExplicit, published });

  useEffect(() => {
    if (landing) navigate({ quarter: landing }, { replace: true });
  }, [landing, navigate]);

  // Either we do not yet know which quarter to show, or we know and are about
  // to switch to it. Both mean "do not paint the report yet": rendering now
  // would flash the empty state for a quarter we are one tick from leaving.
  const settling = (!quarterExplicit && published === null) || landing !== null;

  const handleReady = useCallback(() => {
    setAppReady(true);
    clearTimeout(announcementTimer.current);
    setAnnouncement(`${agencyName} ${q.title} ${viewLabel} report loaded`);
    announcementTimer.current = setTimeout(() => setAnnouncement(""), 3000);
  }, [agencyName, q, viewLabel]);

  // Tab title and favicon mirror the report on screen.
  useEffect(() => {
    document.title = `${agencyName} · ${q.title} · ${viewLabel}`;
    setFavicon(q.label);
  }, [agencyName, q, viewLabel]);

  // Agency-keyed accent colour (see editorial.css body[data-agency] rules)
  useEffect(() => {
    document.body.dataset.agency = AGENCIES[agency] ? agency : "isl";
  }, [agency]);

  useEffect(() => () => clearTimeout(announcementTimer.current), []);

  return (
    <>
      {/* Screen-reader-only live region announces when each page finishes loading */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>

      <LoadingScreen visible={!appReady} />

      {/* Scroll-driven reading progress (CSS-only; hidden where unsupported) */}
      <div className="scroll-progress" aria-hidden="true" />

      <AppNav agency={agency} view={view} quarter={quarter} onNavigate={navigate} />

      <Suspense fallback={<PageSkeleton view={view} />}>
        {/* Rendering mid-resolution would flash the empty state for a quarter
            we are one tick away from replacing. */}
        {settling && <PageSkeleton view={view} />}
        {!settling && view === "social" && (
          <SocialPage key={`${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {!settling && view === "web" && (
          <WebPage key={`web-${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {!settling && view === "paid" && (
          <PaidPage
            key={`paid-${agency}-${quarter}`}
            agency={agency}
            quarter={quarter}
            onReady={handleReady}
          />
        )}
        {!settling && view === "trends" && <TrendsPage key={agency} agency={agency} onReady={handleReady} />}
      </Suspense>

      <footer className="wrap colophon">
        <span>
          Prepared by <span className="colophon-author">{REPORT_AUTHOR}</span>
        </span>
        <span className="colophon-sep" aria-hidden="true">
          {" "}
          ·{" "}
        </span>
        <span className="colophon-year">{q.fiscalYear}</span>
        <span className="colophon-sep" aria-hidden="true">
          {" "}
          ·{" "}
        </span>
        <span className="colophon-agency">{agencyName}</span>
      </footer>
    </>
  );
}

const isAdmin = window.location.pathname.startsWith("/admin");
ReactDOM.createRoot(document.getElementById("root")).render(
  isAdmin ? (
    <Suspense fallback={<LoadingScreen visible />}>
      <AdminApp />
    </Suspense>
  ) : (
    <App />
  )
);
