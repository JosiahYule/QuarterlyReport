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

const { useState, useEffect, useRef } = React;

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

// Quarter definitions: label shown in the chooser, the range string, and the
// quarter number suffix used to build the report key (prefix + suffix = key).
const QUARTERS = [
  { suffix: "q3", label: "Q3", rangeLabel: "Mar–May 2026", year: "2026" },
  { suffix: "q2", label: "Q2", rangeLabel: "Dec–Feb 2026", year: "2026" },
  { suffix: "q1", label: "Q1", rangeLabel: "Sep–Nov 2025", year: "2025" },
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
            rel="noopener"
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

  const tabs = [
    { id: "social", label: "Social Media", href: buildUrl({ agency: currentAgency }) },
    { id: "web",    label: "Website",      href: "/web/?" + new URLSearchParams({ agency: currentAgency }).toString() },
    { id: "trends", label: "Trends",       href: "/trends/?" + new URLSearchParams({ agency: currentAgency }).toString() },
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
// CSS ADDITIONS FOR AGENCY SWITCHER
// Injected once at runtime so it lives alongside the component logic.
// These extend editorial.css without touching that file.
// =============================================================================
function injectAgencyStyles() {
  if (document.getElementById("nav-agency-styles")) return;
  const style = document.createElement("style");
  style.id = "nav-agency-styles";
  style.textContent = `
  /* ---- Masthead positioning fix ---- */
.masthead {
  overflow: visible !important;
}
.masthead-row {
  overflow: visible !important;
}
.masthead-left {
  position: relative;
  overflow: visible !important;
}
    /* ---- Masthead agency button ---- */
    .masthead-agency-btn {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      font-family: var(--serif);
      font-size: 28px;
      line-height: 1;
      letter-spacing: -0.02em;
      color: var(--ink);
      position: relative;
    }
    .masthead-agency-btn em {
      font-style: italic;
      color: var(--isl-blue);
    }
    .masthead-agency-caret {
      font-family: var(--sans);
      font-size: 11px;
      color: var(--ink-4);
      margin-left: 2px;
      transition: transform .15s ease;
      align-self: center;
    }
    .masthead-agency-btn[aria-expanded="true"] .masthead-agency-caret {
      transform: rotate(180deg);
    }
    .masthead-agency-btn:hover em,
    .masthead-agency-btn:focus-visible em {
      opacity: 0.75;
    }
    .masthead-agency-btn:focus-visible {
      outline: 2px solid var(--isl-blue);
      outline-offset: 4px;
      border-radius: 2px;
    }

    /* ---- Agency dropdown menu ---- */
    .agency-menu {
      position: absolute;
      top: calc(100% + 10px);
      left: 0;
      z-index: 200;
      background: var(--paper);
      border: 1px solid var(--ink);
      min-width: 230px;
      padding: 6px 0;
      box-shadow: 0 8px 24px rgba(20,17,13,0.12);
    }
    .agency-option {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: var(--ink-2);
      font-size: 13px;
      transition: background .12s ease;
    }
    .agency-option:hover,
    .agency-option:focus-visible {
      background: var(--paper-2);
      color: var(--ink);
      outline: none;
    }
    .agency-option.is-current {
      color: var(--ink);
    }
    .agency-option-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 22px;
      border-radius: 2px;
      font-family: var(--sans);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: #fff;
      flex-shrink: 0;
    }
    /* Per-agency badge colours — extend here if you add more agencies */
    .agency-badge-isl  { background: #0a4d8c; }
    .agency-badge-as   { background: #7a5c00; }
    .agency-badge-ads  { background: #0F5B78; }

    .agency-option-name {
      flex: 1;
    }
    .agency-option-check {
      font-size: 12px;
      color: var(--isl-blue);
      flex-shrink: 0;
    }

    /* ---- Masthead site link ---- */
    .masthead-site-link {
      font-size: 12px;
      color: var(--ink-4);
      text-decoration: none;
      transition: color .12s ease;
    }
    .masthead-site-link:hover {
      color: var(--ink-2);
    }
  `;
  document.head.appendChild(style);
}

// =============================================================================
// PUBLIC API
// =============================================================================

// renderNav — call once per page, before data loads.
//   active:    "social" | "web" | "trends"
//   quarter:   { key, label, rangeLabel } — pass null for pages without quarter switching
//   onQuarter: callback — pass null for pages without quarter switching
function renderNav(active, quarter, onQuarter) {
  injectAgencyStyles();
  const navRoot = document.getElementById("nav-root");
  if (!navRoot) return;

  const { agency } = getParams();

  ReactDOM.createRoot(navRoot).render(
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
