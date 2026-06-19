import React, { useEffect } from "react";
import { IconClose } from "./Icons.jsx";

// Clean reading view for presenting the report to an audience. When active it
// sets `data-present` on <body> (the CSS hides the nav, section rail, and
// footer, enlarges the type, and centers the column) and renders a slim exit
// bar. Entering also requests browser fullscreen for a true present feel; this
// component keeps React state in sync if the user leaves fullscreen via the
// browser (Esc / F11), and Esc always exits whether or not fullscreen took.
export function PresentationMode({ active, onExit }) {
  useEffect(() => {
    if (active) {
      document.body.dataset.present = "true";
    } else {
      delete document.body.dataset.present;
    }
    return () => { delete document.body.dataset.present; };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const onKey = (e) => { if (e.key === "Escape") onExit(); };
    // Leaving browser fullscreen (Esc / F11 / OS chrome) should drop us out of
    // presentation mode too, so the two never get out of sync.
    const onFsChange = () => { if (!document.fullscreenElement) onExit(); };

    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [active, onExit]);

  if (!active) return null;

  return (
    <div className="present-bar" role="toolbar" aria-label="Presentation controls">
      <span className="present-hint">Presenting — press Esc to exit</span>
      <button className="present-exit" onClick={onExit} aria-label="Exit presentation mode">
        <IconClose />
      </button>
    </div>
  );
}
