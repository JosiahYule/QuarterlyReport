import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// nav.jsx — shared masthead, nav, and loading screen
// Used by: index.html (Social Media), web/index.html (Website), trends/index.html (Trends)
//
// URL params this file reads:
//   ?agency=isl|as|ads   — which agency to display (default: isl)
//   ?report=islq3        — which quarter dataset to load (managed by each page)
//
// Usage: include BEFORE app-specific script, then call:
//   renderNav("social")   — or "web" or "trends"
//
// The agency and quarter are stored in the URL so the page can be bookmarked,
// shared, or refreshed and land in the same state.
// =============================================================================

// =============================================================================
// SHARED UTILITIES
// Defined here (loaded first on every page) so app.jsx, web, and trends
// don't each need their own copy.
// =============================================================================
function parseDelta(d) {
  if (d == null) return { dir: "flat", pct: 0 };
  if (typeof d === "object" && "dir" in d) return d;
  if (typeof d === "object" && "direction" in d) return { dir: d.direction === "up" ? "up" : d.direction === "down" ? "down" : "flat", pct: d.percent || 0 };
  if (typeof d !== "string") return { dir: "flat", pct: 0 };
  const s = d.trim();
  let dir = "flat";
  if (/^[▲↑]/.test(s) || /\bup\b/i.test(s)) dir = "up";
  else if (/^[▼↓]/.test(s) || /\bdown\b/i.test(s)) dir = "down";
  const m = s.match(/-?\d+(\.\d+)?/);
  return { dir, pct: m ? Math.abs(parseFloat(m[0])) : 0 };
}
function arrow(dir) { return dir === "up" ? "↑" : dir === "down" ? "↓" : "—"; }

// Returns the quarter config entry for a given suffix ("q1", "q2", "q3").
function getQuarterBySuffix(suffix) {
  return QUARTERS.find(q => q.suffix === suffix) || QUARTERS[0];
}

// =============================================================================
// AGENCY CONFIG
// All agency-specific text and key prefixes live here. To add a new agency,
// add one entry to this object. Nothing else needs to change.
// =============================================================================
const AGENCIES = {
  isl: {
    label:  "ISL",
    name:   "Integrated Staffing",
    prefix: "isl",   // report keys become islq1, islq2, islq3 …
    url:    "https://integratedstaffing.ca",
  },
  as: {
    label:  "AS",
    name:   "Accountant Staffing",
    prefix: "as",    // asq1, asq2, asq3 …
    url:    "https://accountantstaffing.ca",
  },
  ads: {
    label:  "ADS",
    name:   "Administrative Staffing",
    prefix: "ads",   // adsq1, adsq2, adsq3 …
    url:    "https://administrativestaffing.ca",
  },
};

// Quarter definitions — single source of truth for all pages.
const QUARTERS = [
  { suffix: "q3", label: "Q3", quarterWord: "Three", rangeLabel: "Mar–May 2026", year: "2026", issue: "3" },
  { suffix: "q2", label: "Q2", quarterWord: "Two",   rangeLabel: "Dec–Feb 2026", year: "2026", issue: "2" },
  { suffix: "q1", label: "Q1", quarterWord: "One",   rangeLabel: "Sep–Nov 2025", year: "2025", issue: "1" },
];

// =============================================================================
// URL HELPERS
// Build hrefs that preserve the current agency when switching quarters, and
// preserve the current quarter when switching agencies.
// =============================================================================
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    agency:  p.get("agency")  || "isl",
    report:  p.get("report")  || "islq3",
  };
}

// Given an agency key and a quarter suffix, return the canonical report key.
// e.g. agencyReportKey("as", "q2") => "asq2"
function agencyReportKey(agencyKey, suffix) {
  return (AGENCIES[agencyKey]?.prefix ?? agencyKey) + suffix;
}

// Derive the current quarter suffix from the active report key.
// "islq3" -> "q3", "asq2" -> "q2", etc.
function reportSuffix(reportKey) {
  const m = String(reportKey || "").match(/q\d+$/);
  return m ? m[0] : "q3";
}

// Build a new URL preserving the current path and merging new params.
function buildUrl(newParams) {
  const u = new URL(window.location.href);
  Object.entries(newParams).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

// =============================================================================
// LOADING SCREEN
// Generic — no company name. Fades out when hideLoadingScreen() is called.
// =============================================================================
function LoadingScreen() {
  return (
    <div className="loading-screen" id="loadingScreen" role="status" aria-label="Loading">
      <div className="loading-wordmark serif">
        Loading <em>Report</em>
      </div>
      <div className="loading-track"><div className="loading-fill"></div></div>
      <div className="loading-label">Preparing data</div>
    </div>
  );
}

// =============================================================================
// MASTHEAD
// Shows the agency name. Clicking the agency token opens a subtle inline
// switcher that lives visually inside the masthead — not a floating modal.
// =============================================================================
function Masthead({ agencyKey, onAgencyChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef();
  const agency = AGENCIES[agencyKey] || AGENCIES.isl;

  // Close on outside click or Escape
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleSelect = (key) => {
    setOpen(false);
    if (key === agencyKey) return;
    // Preserve the current quarter suffix when switching agencies
    const { report } = getParams();
    const suffix = reportSuffix(report);
    const newReport = agencyReportKey(key, suffix);
    const newUrl = buildUrl({ agency: key, report: newReport });
    window.location.href = newUrl;
  };

  // Split name into first word and rest so we can italicise the last word
  // in the same style as the existing "Integrated Staffing" treatment.
  const words = agency.name.split(" ");
  const first = words.slice(0, -1).join(" ");
  const last  = words[words.length - 1];

  return (
    <header className="masthead">
      <div className="wrap masthead-row">
        <div className="masthead-left" ref={wrapRef}>

          {/* The agency name doubles as the switcher trigger */}
          <button
            className="masthead-mark serif masthead-agency-btn"
            onClick={() => setOpen(!open)}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={`Current agency: ${agency.name}. Click to switch.`}
            title="Switch agency"
          >
            {first && <>{first} </>}<em>{last}</em>
            <span className="masthead-agency-caret" aria-hidden="true">▾</span>
          </button>

          {/* Inline agency switcher — appears just below the masthead mark */}
          {open && (
            <div className="agency-menu" role="menu" aria-label="Switch agency">
              {Object.entries(AGENCIES).map(([key, cfg]) => (
                <button
                  key={key}
                  role="menuitem"
                  className={"agency-option" + (key === agencyKey ? " is-current" : "")}
                  onClick={() => handleSelect(key)}
                >
                  <span className={"agency-option-badge agency-badge-" + key} aria-hidden="true">
                    {cfg.label}
                  </span>
                  <span className="agency-option-name">{cfg.name}</span>
                  {key === agencyKey && (
                    <span className="agency-option-check" aria-hidden="true">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}

        </div>

        {/* Right side: link back to the agency website */}
        <div className="masthead-right">
          <a
            href={agency.url}
            target="_blank"
            rel="noopener noreferrer"
            className="masthead-site-link"
          >
            {agency.url.replace("https://", "")}
          </a>
        </div>

      </div>
    </header>
  );
}

// =============================================================================
// MASTNAV
// Sticky tab bar with section tabs (Social Media / Website / Trends) and
// the quarter chooser on the right. Quarter links are agency-aware — they
// preserve the current agency when jumping to a different quarter.
// =============================================================================
function MastNav({ active, agencyKey, quarter, onQuarter }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const currentAgency = agencyKey || getParams().agency || "isl";

const currentSuffix = reportSuffix(quarter?.key || getParams().report || "q3");
const tabs = [
  { id: "social", label: "Social Media", href: "/?" + new URLSearchParams({ agency: currentAgency, report: agencyReportKey(currentAgency, currentSuffix) }).toString() },
  { id: "web",    label: "Website",      href: "/web/?" + new URLSearchParams({ agency: currentAgency, report: "web" + currentSuffix }).toString() },
  { id: "trends", label: "Trends",       href: "/trends/?" + new URLSearchParams({ agency: currentAgency, report: agencyReportKey(currentAgency, currentSuffix) }).toString() },
];

  // Group quarters by year for the dropdown header rows
  const years = [...new Set(QUARTERS.map(q => q.year))];

  return (
    <div className="masthead-nav">
      <div className="wrap">
        <div className="masthead-nav-row">

          <nav className="nav-tabs">
            {tabs.map(t => (
              <a key={t.id} href={t.href} className={active === t.id ? "is-active" : ""}>
                {t.label}
              </a>
            ))}
          </nav>

          {onQuarter ? (
            <div className="nav-meta">
              <span>{quarter?.rangeLabel ?? ""}</span>
              <div ref={ref} style={{ position: "relative" }}>
                <button
                  className="qchooser"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                >
                  <span>{quarter?.label ?? "Quarter"}</span>
                  <span className="caret">▾</span>
                </button>

                <div className={"menu" + (open ? " is-open" : "")} role="menu">
                  {years.map(year => (
                    <React.Fragment key={year}>
                      <div className="group">{year}</div>
                      {QUARTERS.filter(q => q.year === year).map(q => {
                        const reportKey = agencyReportKey(currentAgency, q.suffix);
                        const href = buildUrl({ agency: currentAgency, report: reportKey });
                        const isActive = quarter?.key === reportKey;
                        return (
                          <a
                            key={q.suffix}
                            href={href}
                            role="menuitem"
                            className={isActive ? "active" : ""}
                            onClick={() => setOpen(false)}
                          >
                            {q.label} — {q.rangeLabel}
                          </a>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>

              </div>
            </div>
          ) : (
            <div className="nav-meta">
              <span>Q1 · Q2 · Q3</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PUBLIC API
// =============================================================================

let _navReactRoot = null;

// renderNav — call to mount or update the nav (safe to call multiple times).
//   active:    "social" | "web" | "trends"
//   quarter:   { key, label, rangeLabel } — pass null for pages without quarter switching
//   onQuarter: callback — pass null for pages without quarter switching
function renderNav(active, quarter, onQuarter) {
  const navRoot = document.getElementById("nav-root");
  if (!navRoot) return;

  const { agency } = getParams();

  if (!_navReactRoot) _navReactRoot = ReactDOM.createRoot(navRoot);
  _navReactRoot.render(
    <>
      <LoadingScreen />
      <Masthead agencyKey={agency} />
      <MastNav active={active} agencyKey={agency} quarter={quarter} onQuarter={onQuarter} />
    </>
  );
}

// hideLoadingScreen — call after your page data has rendered.
function hideLoadingScreen() {
  const el = document.getElementById("loadingScreen");
  if (!el) return;
  el.classList.add("is-gone");
  setTimeout(() => el.remove(), 500);
}

// getActiveAgency — convenience for page scripts that need to know the current agency.
// Returns one of: "isl" | "as" | "ads"
function getActiveAgency() {
  return getParams().agency || "isl";
}

// getActiveAgencyConfig — returns the full AGENCIES entry for the current agency.
function getActiveAgencyConfig() {
  return AGENCIES[getActiveAgency()] || AGENCIES.isl;
}

// buildReportKey — convenience for page scripts to get the correct report key
// based on current URL params (e.g. "islq3", "asq2").
function buildReportKey(fallbackSuffix = "q3") {
  const { agency, report } = getParams();
  if (report) return report;
  return agencyReportKey(agency, fallbackSuffix);
}

export {
  parseDelta, arrow, getQuarterBySuffix,
  AGENCIES, QUARTERS,
  getParams, agencyReportKey, reportSuffix, buildUrl,
  renderNav, hideLoadingScreen,
  getActiveAgency, getActiveAgencyConfig, buildReportKey,
};
