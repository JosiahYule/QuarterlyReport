import { useEffect, useState } from "react";

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Animates a numeric value from 0 to its final figure on mount, formatting
// each frame with the caller's formatter. Non-numeric values (null → "—")
// and reduced-motion users get the final figure immediately.
export function CountUp({ value, format = String, duration = 700 }) {
  const animatable = typeof value === "number" && Number.isFinite(value);
  const [display, setDisplay] = useState(() =>
    animatable && !reducedMotion() ? format(Number.isInteger(value) ? 0 : 0.0) : format(value)
  );

  useEffect(() => {
    if (!animatable || reducedMotion()) {
      setDisplay(format(value));
      return;
    }
    let raf;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const v = value * ease(p);
      setDisplay(format(p === 1 ? value : Number.isInteger(value) ? Math.round(v) : v));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}
