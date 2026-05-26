import React, { useState, useEffect, useRef } from "react";
import { AGENCIES, QUARTERS } from "../config.js";

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

// ─── Masthead ─────────────────────────────────────────────────────
export function Masthead({ agency, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const cfg = AGENCIES[agency] || AGENCIES.isl;
  const words = cfg.name.split(" ");
  const rest = words.slice(0, -1).join(" ");
  const last = words[words.length - 1];

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

  return (
    <header className="masthead">
      <div className="wrap masthead-row">
        <div className="masthead-left" ref={ref}>
          <button
            className="masthead-agency-btn serif"
            onClick={() => setOpen(o => !o)}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={`Current agency: ${cfg.name}. Click to switch.`}
          >
            {rest && <>{rest} </>}<em>{last}</em>
            <span className="masthead-agency-caret" aria-hidden="true">▾</span>
          </button>
          {open && (
            <AgencyMenu
              current={agency}
              onSelect={key => onNavigate({ agency: key })}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
        <a
          href={cfg.url}
          target="_blank"
          rel="noopener noreferrer"
          className="masthead-site-link"
        >
          {cfg.url.replace("https://", "")}
        </a>
      </div>
    </header>
  );
}

// ─── Sticky nav ───────────────────────────────────────────────────
export function StickyNav({ view, quarter, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const q = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];

  const tabs = [
    { id: "social",  label: "Social Media" },
    { id: "web",     label: "Website" },
    { id: "trends",  label: "Trends" },
  ];

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

  return (
    <div className="masthead-nav">
      <div className="wrap masthead-nav-row">
        <nav className="nav-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={view === t.id ? "is-active" : ""}
              onClick={() => onNavigate({ view: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="nav-meta">
          <span>{q.rangeLabel}</span>
          <div ref={ref} style={{ position: "relative" }}>
            <button
              className="qchooser"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}
            >
              <span>{q.label}</span>
              <span className="caret">▾</span>
            </button>
            {open && (
              <QuarterMenu
                current={quarter}
                onSelect={suffix => onNavigate({ quarter: suffix })}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
