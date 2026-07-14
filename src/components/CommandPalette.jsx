import React, { useState, useEffect, useMemo, useRef } from "react";
import { buildCommands } from "../lib/commands.js";
import { IconSearch, IconCheck } from "./Icons.jsx";

export const isMacLike = /Mac|iPhone|iPad/i.test(
  typeof navigator !== "undefined" ? navigator.platform || "" : ""
);

// ⌘K command palette — jump to any agency/quarter/view, copy the current
// URL, or open the admin. Rendered only while open; the global hotkey lives
// in main.jsx so it works even before the palette has ever been opened.
export function CommandPalette({ agency, quarter, view, onNavigate, onClose }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const groups = useMemo(
    () => buildCommands(query, { agency, quarter, view }),
    [query, agency, quarter, view]
  );
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const active = flat[Math.min(activeIdx, flat.length - 1)];

  // Focus the input on open, lock body scroll, restore focus on close
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  // Keep the active option in view while arrowing through a long list
  useEffect(() => {
    if (!active) return;
    listRef.current
      ?.querySelector(`[data-cmdk-id="${active.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (item) => {
    if (!item) return;
    if (item.kind === "navigate") onNavigate(item.payload);
    else if (item.kind === "copy-link") navigator.clipboard?.writeText(window.location.href);
    else if (item.kind === "admin") { window.location.href = "/admin"; return; }
    onClose();
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx(i => (flat.length ? (i + 1) % flat.length : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx(i => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIdx(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIdx(Math.max(0, flat.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        run(active);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Tab":
        // Single-field dialog — keep focus on the input
        e.preventDefault();
        break;
    }
  };

  return (
    <div className="cmdk-overlay" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command menu">
        <div className="cmdk-input-row">
          <span className="cmdk-search-icon" aria-hidden="true"><IconSearch /></span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="Jump to a view, agency, or quarter…"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={active ? `cmdk-item-${active.id}` : undefined}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="cmdk-list" ref={listRef} id="cmdk-listbox" role="listbox">
          {flat.length === 0 && (
            <div className="cmdk-empty">No results for “{query}”</div>
          )}
          {groups.map(group => (
            <div key={group.label} role="presentation">
              <div className="cmdk-group-label" role="presentation">{group.label}</div>
              {group.items.map(item => {
                const isActive = item === active;
                return (
                  <button
                    key={item.id}
                    id={`cmdk-item-${item.id}`}
                    data-cmdk-id={item.id}
                    data-idx={flat.indexOf(item)}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    className={"cmdk-option" + (isActive ? " is-active" : "")}
                    onPointerMove={e => setActiveIdx(Number(e.currentTarget.dataset.idx))}
                    onClick={() => run(item)}
                  >
                    {item.badge && (
                      <span className={"agency-option-badge agency-badge-" + item.badge} aria-hidden="true">
                        {item.badgeLabel}
                      </span>
                    )}
                    <span className="cmdk-option-label">{item.label}</span>
                    {item.current && (
                      <span className="cmdk-option-check" aria-hidden="true"><IconCheck /></span>
                    )}
                    <span className="cmdk-option-meta">{item.meta}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk-foot" aria-hidden="true">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">↵</kbd> select</span>
          <span><kbd className="kbd">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
