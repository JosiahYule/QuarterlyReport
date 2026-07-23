import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { AdminApp } from "./pages/admin/AdminApp.jsx";
import ReactDOM from "react-dom/client";
import { useUrlState } from "./hooks/useUrlState.js";
import { AppNav } from "./components/Nav.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { PageSkeleton } from "./components/Skeleton.jsx";
import { AGENCIES, QUARTERS, CURRENT_QUARTER, REPORT_AUTHOR } from "./config.js";
import { VIEW_LABELS } from "./lib/commands.js";
import { installGlobalErrorReporting } from "./lib/monitor.js";
import { setFavicon } from "./lib/favicon.js";

installGlobalErrorReporting();

const SocialPage = lazy(() => import("./pages/SocialPage.jsx").then(m => ({ default: m.SocialPage })));
const WebPage    = lazy(() => import("./pages/WebPage.jsx").then(m => ({ default: m.WebPage })));
const PaidPage   = lazy(() => import("./pages/PaidPage.jsx").then(m => ({ default: m.PaidPage })));
const TrendsPage = lazy(() => import("./pages/TrendsPage.jsx").then(m => ({ default: m.TrendsPage })));

function App() {
  const [urlState, navigate] = useUrlState();
  const { agency, quarter, view } = urlState;
  const [appReady, setAppReady] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announcementTimer = useRef(null);

  // ⌘K / Ctrl+K toggles the command palette from anywhere
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleReady = useCallback(() => {
    setAppReady(true);
    const cfg = AGENCIES[agency] || AGENCIES.isl;
    const q = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
    const viewLabel = VIEW_LABELS[view] || VIEW_LABELS.social;
    const msg = `${cfg.name} ${q.label} ${viewLabel} report loaded`;
    clearTimeout(announcementTimer.current);
    setAnnouncement(msg);
    announcementTimer.current = setTimeout(() => setAnnouncement(""), 3000);
  }, [agency, quarter, view]);

  useEffect(() => {
    const cfg = AGENCIES[agency] || AGENCIES.isl;
    const q   = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
    const viewLabel = VIEW_LABELS[view] || VIEW_LABELS.social;
    document.title = `${cfg.name} ${q.label} ${q.year} — ${viewLabel}`;
  }, [agency, quarter, view]);

  // Tab favicon mirrors the quarter on screen (defaults to today's quarter
  // on first load, since that's the default view)
  useEffect(() => {
    const q = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
    setFavicon(q.label);
  }, [quarter]);

  // Agency-keyed accent colour (see editorial.css body[data-agency] rules)
  useEffect(() => {
    document.body.dataset.agency = AGENCIES[agency] ? agency : "isl";
  }, [agency]);

  useEffect(() => () => clearTimeout(announcementTimer.current), []);

  const skelView = view === "web" ? "web" : view === "paid" ? "paid" : view === "trends" ? "trends" : "social";

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

      {/* Scroll-driven reading progress (CSS-only; hidden where unsupported) */}
      <div className="scroll-progress" aria-hidden="true" />

      <AppNav
        agency={agency}
        view={view}
        quarter={quarter}
        onNavigate={navigate}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      {paletteOpen && (
        <CommandPalette
          agency={agency}
          quarter={quarter}
          view={view}
          onNavigate={navigate}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      <Suspense fallback={<PageSkeleton view={skelView} />}>
        {view === "social" && (
          <SocialPage key={`${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {view === "web" && (
          <WebPage key={`web-${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {view === "paid" && (
          <PaidPage key={`paid-${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />
        )}
        {view === "trends" && (
          <TrendsPage key={agency} agency={agency} onReady={handleReady} />
        )}
      </Suspense>

      <footer className="wrap colophon">
        <span>Prepared by <span className="colophon-author">{REPORT_AUTHOR}</span></span>
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
