import React, { useState, useCallback } from "react";
import { AGENCIES, QUARTERS } from "../../config.js";
import { SocialForm } from "./SocialForm.jsx";
import { WebForm } from "./WebForm.jsx";

export function AdminDashboard({ onSignOut }) {
  const [agency,  setAgency]  = useState("isl");
  const [quarter, setQuarter] = useState(QUARTERS[0].suffix);
  const [type,    setType]    = useState("social");
  const [isDirty, setIsDirty] = useState(false);

  // Wraps any navigation action with an unsaved-changes confirmation
  const guard = useCallback((action) => {
    if (isDirty && !window.confirm("You have unsaved changes. Discard them and continue?")) return;
    setIsDirty(false);
    action();
  }, [isDirty]);

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <span className="admin-wordmark serif">Report Admin</span>
            <div className="admin-header-selects">
              <select className="admin-select" value={agency}
                onChange={e => guard(() => setAgency(e.target.value))}>
                {Object.entries(AGENCIES).map(([k, cfg]) => (
                  <option key={k} value={k}>{cfg.name}</option>
                ))}
              </select>
              <select className="admin-select" value={quarter}
                onChange={e => guard(() => setQuarter(e.target.value))}>
                {QUARTERS.map(q => (
                  <option key={q.suffix} value={q.suffix}>{q.label} — {q.rangeLabel}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-header-right">
            <div className="admin-type-tabs" role="tablist">
              {[
                { id: "social", label: "Social" },
                { id: "web",    label: "Website" },
              ].map(t => (
                <button key={t.id} role="tab" aria-selected={type === t.id}
                  className={"admin-type-tab" + (type === t.id ? " is-active" : "")}
                  onClick={() => guard(() => setType(t.id))}>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="admin-btn-ghost" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {type === "social"
          ? <SocialForm key={agency + quarter} agency={agency} quarter={quarter} onDirtyChange={setIsDirty} />
          : <WebForm    key={agency + quarter}   agency={agency} quarter={quarter} onDirtyChange={setIsDirty} />
        }
      </main>
    </div>
  );
}
