import React, { useState, useEffect, useRef, useCallback } from "react";
import { AGENCIES, QUARTERS } from "../config.js";
import { IconCaret, IconCheck } from "./Icons.jsx";

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
  const items = Object.entries(AGENCIES);
  const itemRefs = useRef([]);

  // Focus the active (or first) item on mount
  useEffect(() => {
    const activeIdx = Math.max(0, items.findIndex(([k]) => k === current));
    itemRefs.current[activeIdx]?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e, idx) => {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        itemRefs.current[(idx + 1) % items.length]?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        itemRefs.current[(idx - 1 + items.length) % items.length]?.focus();
        break;
      }
      case "Home": {
        e.preventDefault();
        itemRefs.current[0]?.focus();
        break;
      }
      case "End": {
        e.preventDefault();
        itemRefs.current[items.length - 1]?.focus();
        break;
      }
    }
  };

  return (
    <div className="agency-menu" role="menu" aria-label="Switch agency">
      {items.map(([key, cfg], i) => (
        <button
          key={key}
          ref={el => { itemRefs.current[i] = el; }}
          role="menuitem"
          className={"agency-option" + (key === current ? " is-current" : "")}
          aria-current={key === current ? "true" : undefined}
          onClick={() => { onSelect(key); onClose(); }}
          onKeyDown={e => handleKeyDown(e, i)}
        >
          <span className={"agency-option-badge agency-badge-" + key} aria-hidden="true">
            {cfg.label}
          </span>
          <span className="agency-option-name">{cfg.name}</span>
          {key === current && <span className="agency-option-check" aria-hidden="true"><IconCheck /></span>}
        </button>
      ))}
    </div>
  );
}

// ─── Quarter chooser dropdown ─────────────────────────────────────
function QuarterMenu({ current, onSelect, onClose }) {
  const years = [...new Set(QUARTERS.map(q => q.year))];
  const allItems = QUARTERS; // flat ordered list for keyboard nav
  const itemRefs = useRef([]);

  useEffect(() => {
    const activeIdx = Math.max(0, allItems.findIndex(q => q.suffix === current));
    itemRefs.current[activeIdx]?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e, idx) => {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        itemRefs.current[(idx + 1) % allItems.length]?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        itemRefs.current[(idx - 1 + allItems.length) % allItems.length]?.focus();
        break;
      }
      case "Home": {
        e.preventDefault();
        itemRefs.current[0]?.focus();
        break;
      }
      case "End": {
        e.preventDefault();
        itemRefs.current[allItems.length - 1]?.focus();
        break;
      }
    }
  };

  let flatIdx = 0;
  return (
    <div className="menu is-open" role="menu">
      {years.map(year => (
        <React.Fragment key={year}>
          <div className="group" role="presentation">{year}</div>
          {QUARTERS.filter(q => q.year === year).map(q => {
            const idx = flatIdx++;
            return (
              <button
                key={q.suffix}
                ref={el => { itemRefs.current[idx] = el; }}
                role="menuitem"
                aria-current={q.suffix === current ? "true" : undefined}
                className={"menu-item" + (q.suffix === current ? " active" : "")}
                onClick={() => { onSelect(q.suffix); onClose(); }}
                onKeyDown={e => handleKeyDown(e, idx)}
              >
                {q.label} — {q.rangeLabel}
              </button>
            );
          })}
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

  const closeAgency  = useCallback(() => setAgencyOpen(false),  []);
  const closeQuarter = useCallback(() => setQuarterOpen(false), []);

  useCloseOnOutside(agencyRef,  closeAgency);
  useCloseOnOutside(quarterRef, closeQuarter);

  const cfg = AGENCIES[agency] || AGENCIES.isl;
  const q   = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];

  return (
    <header className="app-nav">
      <div className="wrap app-nav-row">

        <div className="app-nav-left">

          <div className="app-nav-agency" ref={agencyRef}>
            <button
              className="app-nav-agency-btn serif"
              onClick={() => setAgencyOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={agencyOpen}
              aria-label={`Current agency: ${cfg.name}. Activate to switch.`}
            >
              {cfg.name}
              <span className="app-nav-caret" aria-hidden="true"><IconCaret /></span>
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

          <nav className="app-nav-tabs" aria-label="Report views">
            {TABS.map(t => (
              <button
                key={t.id}
                className={view === t.id ? "is-active" : ""}
                onClick={() => onNavigate({ view: t.id })}
                aria-current={view === t.id ? "page" : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>

        </div>

        <div className="app-nav-right">
          <span className="app-nav-range" aria-hidden="true">{q.rangeLabel}</span>
          <div ref={quarterRef} style={{ position: "relative" }}>
            <button
              className="qchooser"
              aria-haspopup="menu"
              aria-expanded={quarterOpen}
              aria-label={`Current quarter: ${q.label} ${q.rangeLabel}. Activate to change.`}
              onClick={() => setQuarterOpen(o => !o)}
            >
              <span>{q.label}</span>
              <span className="caret" aria-hidden="true"><IconCaret /></span>
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
