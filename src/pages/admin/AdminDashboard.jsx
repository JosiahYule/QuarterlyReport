import React, { useState, useEffect, useCallback } from "react";
import { AGENCIES, QUARTERS } from "../../config.js";
import { SocialForm } from "./SocialForm.jsx";
import { WebForm } from "./WebForm.jsx";
import { PlanTab } from "./PlanTab.jsx";

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <div className="admin-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="admin-confirm-box">
        <p className="admin-confirm-message" id="confirm-title">
          You have unsaved changes. Discard them and continue?
        </p>
        <div className="admin-confirm-actions">
          <button className="admin-btn-primary" onClick={onConfirm} autoFocus>Discard &amp; continue</button>
          <button className="admin-btn-ghost" onClick={onCancel}>Keep editing</button>
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard({ onSignOut }) {
  const [agency,        setAgency]        = useState("isl");
  const [quarter,       setQuarter]       = useState(QUARTERS[0].suffix);
  const [type,          setType]          = useState("social");
  const [isDirty,       setIsDirty]       = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const guard = useCallback((action) => {
    if (isDirty) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }, [isDirty]);

  const confirmDiscard = useCallback(() => {
    setIsDirty(false);
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  const cancelDiscard = useCallback(() => setPendingAction(null), []);

  // Warn before the tab closes with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return (
    <div className="admin-wrap">
      {pendingAction && (
        <ConfirmModal onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <span className="admin-wordmark serif">Report Admin</span>
            {isDirty && <span className="admin-dirty-chip">Unsaved changes</span>}
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
                { id: "plan",   label: "Plan" },
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
        {type === "social" && <SocialForm key={agency + quarter} agency={agency} quarter={quarter} onDirtyChange={setIsDirty} />}
        {type === "web"    && <WebForm    key={agency + quarter} agency={agency} quarter={quarter} onDirtyChange={setIsDirty} />}
        {type === "plan"   && <PlanTab    key={agency + quarter} agency={agency} quarter={quarter} />}
      </main>
    </div>
  );
}
