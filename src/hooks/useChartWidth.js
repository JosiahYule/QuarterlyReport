import { useCallback, useEffect, useRef, useState } from "react";

// The hand-built SVG charts used to draw in a fixed viewBox (880 or 1,100
// units wide) and let the browser scale the whole picture to fit. On a phone
// that scaled the text with it, so an 11-unit label rendered around 4px tall.
//
// This hook measures the element the chart is drawn into, so the chart can
// use that width as its viewBox width. One unit is then one CSS pixel at any
// screen size: labels stay at their intended size and the geometry, which
// every chart already derives from W, reflows around them.
//
// Returns a callback ref for the measured element and its width. Until the
// first measurement (and in test environments without ResizeObserver) it
// reports `fallback`, which is the old fixed width, so the first paint and
// the tests draw exactly what they drew before.
export function useChartWidth(fallback, { min = 280 } = {}) {
  const [width, setWidth] = useState(fallback);
  const observer = useRef(null);

  const ref = useCallback(
    (el) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el || typeof window.ResizeObserver === "undefined") return;
      const measure = (w) => {
        // Whole pixels only: sub-pixel jitter while a layout settles would
        // otherwise re-render the chart on every frame.
        if (w > 0) setWidth(Math.max(min, Math.round(w)));
      };
      measure(el.getBoundingClientRect().width);
      observer.current = new window.ResizeObserver(([entry]) => measure(entry.contentRect.width));
      observer.current.observe(el);
    },
    [min]
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, width];
}

// Charts switch to a compact layout (tighter padding, fewer labels) below
// this width.
export const NARROW_CHART = 560;
