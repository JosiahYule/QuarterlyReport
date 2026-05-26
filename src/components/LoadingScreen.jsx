import { useState, useEffect } from "react";

export function LoadingScreen({ visible }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => setMounted(false), 600);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={"loading-screen" + (!visible ? " is-gone" : "")}
      role="status"
      aria-label="Loading report"
    >
      <div className="loading-wordmark serif">
        Loading <em>Report</em>
      </div>
      <div className="loading-track">
        <div className="loading-fill" />
      </div>
      <div className="loading-label">Preparing data</div>
    </div>
  );
}
