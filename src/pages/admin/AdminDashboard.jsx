import React, { useState, useEffect, useCallback } from "react";
import { AGENCIES, QUARTERS, resolveQuarter } from "../../config.js";
import { SocialForm } from "./SocialForm.jsx";
import { WebForm } from "./WebForm.jsx";
import { SubmissionsTab } from "./SubmissionsTab.jsx";
import { setFavicon } from "../../lib/favicon.js";

// Focus starts on the safe choice, so a reflexive Enter keeps the edits
// rather than throwing them away, and Escape backs out like any dialog.
function ConfirmModal({ onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="admin-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="admin-confirm-box">
        <p className="admin-confirm-message" id="confirm-title">
          You have unsaved changes. Discard them and continue?
        </p>
        <div className="admin-confirm-actions">
          <button className="admin-btn-primary" onClick={onConfirm}>
            Discard &amp; continue
          </button>
          <button className="admin-btn-ghost" onClick={onCancel} autoFocus>
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard({ onSignOut }) {
  const [agency, setAgency] = useState("isl");
  const [quarter, setQuarter] = useState(QUARTERS[0].id);
  const [type, setType] = useState("social");
  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const guard = useCallback(
    (action) => {
      if (isDirty) {
        setPendingAction(() => action);
      } else {
        action();
      }
    },
    [isDirty]
  );

  const confirmDiscard = useCallback(() => {
    setIsDirty(false);
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  const cancelDiscard = useCallback(() => setPendingAction(null), []);

  useEffect(() => {
    setFavicon(resolveQuarter(quarter).label);
  }, [quarter]);

  // Warn before the tab closes with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return (
    <div className="admin-wrap">
      {pendingAction && <ConfirmModal onConfirm={confirmDiscard} onCancel={cancelDiscard} />}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <span className="admin-wordmark serif">Report Admin</span>
            {isDirty && <span className="admin-dirty-chip">Unsaved changes</span>}
            <div className="admin-header-selects">
              <select
                className="admin-select"
                aria-label="Agency"
                value={agency}
                onChange={(e) => guard(() => setAgency(e.target.value))}
              >
                {Object.entries(AGENCIES).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.name}
                  </option>
                ))}
              </select>
              <select
                className="admin-select"
                aria-label="Quarter"
                value={quarter}
                onChange={(e) => guard(() => setQuarter(e.target.value))}
              >
                {[...new Set(QUARTERS.map((q) => q.fiscalYear))].map((fy) => (
                  <optgroup key={fy} label={fy}>
                    {QUARTERS.filter((q) => q.fiscalYear === fy).map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label} · {q.rangeLabel}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-header-right">
            <div className="admin-type-tabs" role="tablist">
              {[
                { id: "social", label: "Social" },
                { id: "web", label: "Website" },
                { id: "subs", label: "Submissions" },
              ].map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={type === t.id}
                  className={"admin-type-tab" + (type === t.id ? " is-active" : "")}
                  onClick={() => guard(() => setType(t.id))}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Signing out unmounts the form without leaving the page, so the
                beforeunload warning never fires; it needs the same guard as
                switching agency or quarter, or the edits simply vanish. */}
            <button className="admin-btn-ghost" onClick={() => guard(onSignOut)}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {type === "social" && (
          <SocialForm key={agency + quarter} agency={agency} quarter={quarter} onDirtyChange={setIsDirty} />
        )}
        {type === "web" && (
          <WebForm key={agency + quarter} agency={agency} quarter={quarter} onDirtyChange={setIsDirty} />
        )}
        {type === "subs" && <SubmissionsTab key={agency} agency={agency} />}
      </main>
    </div>
  );
}
