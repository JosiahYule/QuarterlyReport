import React, { useState, useEffect, useRef } from "react";
import { AGENCIES, QUARTERS } from "../config.js";

const TABS = [
  { id: "social",  label: "Social Media" },
  { id: "web",     label: "Website" },
  { id: "trends",  label: "Trends" },
];

function useCloseOnOutside(ref, onClose) {
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose]);
}

// ─── Agency switcher dropdown ─────────────────────────────────────
function AgencyMenu({ current, onSelect, onClose }) {
  return (
    <div className="agency-menu" role="menu" aria-label="Switch agency">
      {Object.entries(AGENCIES).map(([key, cfg]) => (
        <button
          key={key}
          role="menuitem"
          className={"agency-option" + (key === current ? " is-current" : "")}
          onClick={() => { onSelect(key); onClose(); }}
        >
          <span className={"agency-option-badge agency-badge-" + key} aria-hidden="true">
            {cfg.label}
          </span>
          <span className="agency-option-name">{cfg.name}</span>
          {key === current && <span className="agency-option-check" aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Quarter chooser dropdown ─────────────────────────────────────
function QuarterMenu({ current, onSelect, onClose }) {
  const years = [...new Set(QUARTERS.map(q => q.year))];
  return (
    <div className="menu is-open" role="menu">
      {years.map(year => (
        <React.Fragment key={year}>
          <div className="group">{year}</div>
          {QUARTERS.filter(q => q.year === year).map(q => (
            <button
              key={q.suffix}
              role="menuitem"
              className={"menu-item" + (q.suffix === current ? " active" : "")}
              onClick={() => { onSelect(q.suffix); onClose(); }}
            >
              {q.label} — {q.rangeLabel}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Single combined nav bar ──────────────────────────────────────
export function AppNav({ agency, view, quarter, onNavigate }) {
  const [agencyOpen,  setAgencyOpen]  = useState(false);
  const [quarterOpen, setQuarterOpen] = useState(false);

  const agencyRef  = useRef();
  const quarterRef = useRef();

  useCloseOnOutside(agencyRef,  () => setAgencyOpen(false));
  useCloseOnOutside(quarterRef, () => setQuarterOpen(false));

  const cfg = AGENCIES[agency] || AGENCIES.isl;
  const q   = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];

  const words = cfg.name.split(" ");
  const rest  = words.slice(0, -1).join(" ");
  const last  = words[words.length - 1];

  return (
    <header className="app-nav">
      <div className="wrap app-nav-row">

        {/* Left: agency name → divider → view tabs */}
        <div className="app-nav-left">

          <div className="app-nav-agency" ref={agencyRef}>
            <button
              className="app-nav-agency-btn serif"
              onClick={() => setAgencyOpen(o => !o)}
              aria-haspopup="true"
              aria-expanded={agencyOpen}
              aria-label={`Current agency: ${cfg.name}. Click to switch.`}
            >
              {cfg.name}
              <span className="app-nav-caret" aria-hidden="true">▾</span>
            </button>
            {agencyOpen && (
              <AgencyMenu
                current={agency}
                onSelect={key => onNavigate({ agency: key })}
                onClose={() => setAgencyOpen(false)}
              />
            )}
          </div>

          <div className="app-nav-divider" aria-hidden="true" />

          <nav className="app-nav-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={view === t.id ? "is-active" : ""}
                onClick={() => onNavigate({ view: t.id })}
              >
                {t.label}
              </button>
            ))}
          </nav>

        </div>

        {/* Right: range label + quarter chooser */}
        <div className="app-nav-right">
          <span className="app-nav-range">{q.rangeLabel}</span>
          <div ref={quarterRef} style={{ position: "relative" }}>
            <button
              className="qchooser"
              aria-haspopup="menu"
              aria-expanded={quarterOpen}
              onClick={() => setQuarterOpen(o => !o)}
            >
              <span>{q.label}</span>
              <span className="caret">▾</span>
            </button>
            {quarterOpen && (
              <QuarterMenu
                current={quarter}
                onSelect={suffix => onNavigate({ quarter: suffix })}
                onClose={() => setQuarterOpen(false)}
              />
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
