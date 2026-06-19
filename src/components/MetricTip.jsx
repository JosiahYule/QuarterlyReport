import React, { useState, useRef, useId, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

// A definition that appears on hover/focus — with no visual indicator on the
// target itself (no icon, no underline). Wrap a KPI card or a table column
// header and pass its plain-language `definition`; the popover is portaled to
// <body> so a table's overflow or a section's bounds can't clip it.
//
// Accessibility: the target is focusable (so keyboard users and touch taps get
// the same reveal as a mouse hover), and the definition is always present as a
// visually-hidden, `aria-describedby`-linked node so screen readers announce it
// even though the visual popover is hover-only.
export function MetricTip({ definition, children, as: Tag = "span", className = "", ...rest }) {
  const [pos, setPos] = useState(null); // null = hidden
  const ref = useRef(null);
  const id = useId();

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor above when the target sits in the lower half of the viewport,
    // otherwise below — keeps the popover on-screen without measuring it.
    const below = r.top < window.innerHeight / 2;
    setPos({
      left: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150),
      y: below ? r.bottom + 10 : r.top - 10,
      below,
    });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  // A fixed-position popover would detach from its target on scroll; just hide.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [pos, hide]);

  if (!definition) {
    return <Tag className={className} {...rest}>{children}</Tag>;
  }

  return (
    <Tag
      ref={ref}
      className={("metric-tip " + className).trim()}
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      {...rest}
    >
      {children}
      <span id={id} className="sr-only">{definition}</span>
      {pos &&
        createPortal(
          <span
            className={"metric-tip-pop " + (pos.below ? "is-below" : "is-above")}
            style={{ left: pos.left, top: pos.y }}
            aria-hidden="true"
          >
            {definition}
          </span>,
          document.body,
        )}
    </Tag>
  );
}
