// nav.jsx — shared masthead, nav, and loading screen
// Used by: index.html (Social Media), web/index.html (Website), trends/index.html (Trends)
//
// Usage: include BEFORE app-specific script, then call:
//   renderNav("social")   — or "web" or "trends"
// =============================================================================

const { useState, useEffect, useRef } = React;
const ORG_OPTIONS = [
  { key: "integrated", name: "Integrated", suffix: "Staffing", label: "Integrated Staffing" },
  { key: "accountant", name: "Accountant", suffix: "Staffing", label: "Accountant Staffing" },
  { key: "administrative", name: "Administrative", suffix: "Staffing", label: "Administrative Staffing" },
];
function getOrgConfig() {
  const params = new URLSearchParams(window.location.search);
  const org = (params.get("org") || "integrated").toLowerCase();
  return ORG_OPTIONS.find((o) => o.key === org) || ORG_OPTIONS[0];
}

function LoadingScreen() {
  const org = getOrgConfig();
  return (
    <div className="loading-screen" id="loadingScreen">
      <div className="loading-wordmark serif">{org.name} <em>{org.suffix}</em></div>
      <div className="loading-track"><div className="loading-fill"></div></div>
      <div className="loading-label">Loading report</div>
    </div>
  );
}

function Masthead() {
  const org = getOrgConfig();
  return (
    <header className="masthead">
      <div className="wrap masthead-row">
        <div className="masthead-left">
          <div className="masthead-mark serif">{org.name} <em>{org.suffix}</em></div>
        </div>
      </div>
    </header>
  );
}

function MastNav({ active, quarter, onQuarter }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const tabs = [
    { id: "social", label: "Social Media", href: "/" },
    { id: "web",    label: "Website",      href: "/web/" },
    { id: "trends", label: "Trends",       href: "/trends/" },
  ];
  const org = getOrgConfig().key;
  const withOrg = (href, key) => {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("org", key);
    return url.pathname + url.search;
  };

  return (
    <div className="masthead-nav">
      <div className="wrap">
        <div className="masthead-nav-row">
          <nav className="nav-tabs">
            {tabs.map(t => (
              <a key={t.id} href={withOrg(t.href, org)} className={active === t.id ? "is-active" : ""}>
                {t.label}
              </a>
            ))}
          </nav>
          <div className="nav-meta">
            <div className="org-switch" role="tablist" aria-label="Staffing group">
              {ORG_OPTIONS.map((o) => (
                <a key={o.key} role="tab" aria-selected={org === o.key} className={"org-switch-item" + (org === o.key ? " is-active" : "")} href={withOrg(window.location.pathname + window.location.search, o.key)}>
                  {o.label}
                </a>
              ))}
            </div>
          {onQuarter ? (
            <div className="nav-quarter-meta">
              <span>{quarter?.rangeLabel ?? ""}</span>
              <div ref={ref} style={{ position: "relative" }}>
                <button className="qchooser" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                  <span>{quarter?.label ?? "Quarter"}</span>
                  <span className="caret">▾</span>
                </button>
                <div className={"menu" + (open ? " is-open" : "")} role="menu">
                  <div className="group">2026</div>
                  <a href={`?report=islq3&org=${org}`} role="menuitem" className={quarter?.key === "islq3" ? "active" : ""} onClick={() => setOpen(false)}>Q3 — Mar – May 2026</a>
                  <a href={`?report=islq2&org=${org}`} role="menuitem" className={quarter?.key === "islq2" ? "active" : ""} onClick={() => setOpen(false)}>Q2 — Dec – Feb 2026</a>
                  <div className="group">2025</div>
                  <a href={`?report=islq1&org=${org}`} role="menuitem" className={quarter?.key === "islq1" ? "active" : ""} onClick={() => setOpen(false)}>Q1 — Sep – Nov 2025</a>
                </div>
              </div>
            </div>
          ) : (
            <span>Q1 · Q2 · Q3</span>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Called by each page after including this file.
// active: "social" | "web" | "trends"
// quarter: optional { key, label, rangeLabel } object for pages with quarter switcher
// onQuarter: optional callback — pass null for pages without quarter switching
function renderNav(active, quarter, onQuarter) {
  const navRoot = document.getElementById("nav-root");
  if (!navRoot) return;
  ReactDOM.createRoot(navRoot).render(
    <>
      <LoadingScreen />
      <Masthead />
      <MastNav active={active} quarter={quarter} onQuarter={onQuarter} />
    </>
  );
}

// Call after page content is ready to fade out the loading screen.
function hideLoadingScreen() {
  const el = document.getElementById("loadingScreen");
  if (!el) return;
  el.classList.add("is-gone");
  setTimeout(() => el.remove(), 500);
}
