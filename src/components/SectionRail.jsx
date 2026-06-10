import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Sticky table-of-contents rail shown on wide viewports. Receives the page's
// section list, keeps only the ones actually rendered, and highlights the
// section currently in the reading band via IntersectionObserver.
export function SectionRail({ sections }) {
  const [present, setPresent] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const found = sections.filter((s) => document.getElementById(s.id));
    setPresent(found);
    if (found.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      // Narrow band in the upper third of the viewport
      { rootMargin: "-15% 0px -65% 0px" }
    );
    found.forEach((s) => observer.observe(document.getElementById(s.id)));
    return () => observer.disconnect();
  }, [sections]);

  if (present.length < 2) return null;

  const jump = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const smooth = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  };

  // Portal to <body>: the report wrapper retains a transform from its
  // entrance animation, which would otherwise become the containing block
  // for this fixed-position rail and misplace it over the content.
  return createPortal(
    <nav className="section-rail" aria-label="Report sections">
      {present.map((s) => (
        <button
          key={s.id}
          className={"section-rail-item" + (active === s.id ? " is-active" : "")}
          aria-current={active === s.id ? "true" : undefined}
          onClick={() => jump(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>,
    document.body
  );
}
