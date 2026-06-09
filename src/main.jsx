import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { AdminApp } from "./pages/admin/AdminApp.jsx";
import ReactDOM from "react-dom/client";
import { useUrlState } from "./hooks/useUrlState.js";
import { AppNav } from "./components/Nav.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { PageSkeleton } from "./components/Skeleton.jsx";
import { AGENCIES, QUARTERS, CURRENT_QUARTER } from "./config.js";

const SocialPage = lazy(() => import("./pages/SocialPage.jsx").then(m => ({ default: m.SocialPage })));
const WebPage    = lazy(() => import("./pages/WebPage.jsx").then(m => ({ default: m.WebPage })));
const TrendsPage = lazy(() => import("./pages/TrendsPage.jsx").then(m => ({ default: m.TrendsPage })));

function App() {
  const [urlState, navigate] = useUrlState();
  const { agency, quarter, view } = urlState;
  const [appReady, setAppReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announcementTimer = useRef(null);

  const handleReady = useCallback(() => {
    setAppReady(true);
    const cfg = AGENCIES[agency] || AGENCIES.isl;
    const q = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
    const viewLabel = view === "social" ? "Social Media" : view === "web" ? "Website" : "Trends";
    const msg = `${cfg.name} ${q.label} ${viewLabel} report loaded`;
    clearTimeout(announcementTimer.current);
    setAnnouncement(msg);
    announcementTimer.current = setTimeout(() => setAnnouncement(""), 3000);
  }, [agency, quarter, view]);

  useEffect(() => {
    const cfg = AGENCIES[agency] || AGENCIES.isl;
    const q   = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
    const viewLabel = view === "social" ? "Social Media" : view === "web" ? "Website" : "Trends";
    document.title = `${cfg.name} ${q.label} ${q.year} — ${viewLabel}`;
  }, [agency, quarter, view]);

  useEffect(() => () => clearTimeout(announcementTimer.current), []);

  const skelView = view === "web" ? "web" : view === "trends" ? "trends" : "social";

  return (
    <>
      {/* Screen-reader-only live region announces when each page finishes loading */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {announcement}
      </div>

      <LoadingScreen visible={!appReady} />
      <AppNav agency={agency} view={view} quarter={quarter} onNavigate={navigate} />

      <Suspense fallback={<PageSkeleton view={skelView} />}>
        {view === "social" && (
          <SocialPage key={`${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {view === "web" && (
          <WebPage key={`web-${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {view === "trends" && (
          <TrendsPage key={agency} agency={agency} onReady={handleReady} />
        )}
      </Suspense>

      <footer className="wrap colophon">
        Prepared by <span className="colophon-author">Josiah Yule</span>
        <span className="colophon-sep" aria-hidden="true"> · </span>
        <span className="colophon-year">{CURRENT_QUARTER.year}</span>
        <span className="colophon-sep" aria-hidden="true"> · </span>
        <span className="colophon-agency">{(AGENCIES[agency] || AGENCIES.isl).name}</span>
      </footer>
    </>
  );
}

const isAdmin = window.location.pathname.startsWith("/admin");
ReactDOM.createRoot(document.getElementById("root")).render(isAdmin ? <AdminApp /> : <App />);
