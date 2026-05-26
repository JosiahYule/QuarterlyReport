import React, { useState, useCallback, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useUrlState } from "./hooks/useUrlState.js";
import { AppNav } from "./components/Nav.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { SocialPage } from "./pages/SocialPage.jsx";
import { WebPage } from "./pages/WebPage.jsx";
import { TrendsPage } from "./pages/TrendsPage.jsx";
import { AGENCIES, QUARTERS } from "./config.js";

function App() {
  const [urlState, navigate] = useUrlState();
  const { agency, quarter, view } = urlState;
  const [appReady, setAppReady] = useState(false);

  const handleReady = useCallback(() => setAppReady(true), []);

  // Update page title on state changes
  useEffect(() => {
    const cfg = AGENCIES[agency] || AGENCIES.isl;
    const q   = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
    const viewLabel = view === "social" ? "Social Media" : view === "web" ? "Website" : "Trends";
    document.title = `${cfg.name} ${q.label} ${q.year} — ${viewLabel}`;
  }, [agency, quarter, view]);

  return (
    <>
      <LoadingScreen visible={!appReady} />
      <AppNav agency={agency} view={view} quarter={quarter} onNavigate={navigate} />
      {view === "social" && <SocialPage key={`${agency}-${quarter}`} agency={agency} quarter={quarter} onReady={handleReady} />}
      {view === "web"    && <WebPage    key={`web-${quarter}`}        agency={agency} quarter={quarter} onReady={handleReady} />}
      {view === "trends" && <TrendsPage key={agency}                  agency={agency}                   onReady={handleReady} />}
      <footer className="wrap colophon">Prepared by Josiah Yule</footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
