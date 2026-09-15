import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { resolveQuarter } from "../../config.js";

// A scheduled job that quietly stops working is not noticed when it breaks, it
// is noticed at reporting time as a quarter of missing data. So the admin says
// out loud when the job last ran and how it went, and it treats silence as a
// problem in its own right: a run that succeeded three weeks ago on a weekly
// schedule is a broken job, not a healthy one.
//
// The weekly schedule plus one missed run is eight days, so anything past that
// is worth a warning rather than a tick.
export const STALE_AFTER_DAYS = 8;

export function describeRun(run, now = new Date()) {
  if (!run) {
    return {
      tone: "idle",
      text: "No GA4 sync recorded for this quarter yet.",
    };
  }
  const started = new Date(run.started_at);
  const days = Math.floor((now - started) / 86400000);
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;

  if (run.status === "failed") {
    return { tone: "error", text: `GA4 sync failed ${when}: ${run.message || "no detail recorded"}` };
  }
  if (run.status === "skipped") {
    return { tone: "warn", text: `GA4 sync wrote nothing ${when}: ${run.message || "no detail recorded"}` };
  }
  if (days >= STALE_AFTER_DAYS) {
    return {
      tone: "warn",
      text: `GA4 last synced ${when} — the job runs weekly, so it may have stopped.`,
    };
  }
  return { tone: "ok", text: `GA4 synced ${when}.` };
}

export function SyncStatus({ agency, quarter }) {
  const [run, setRun] = useState(undefined); // undefined = still loading

  useEffect(() => {
    let cancelled = false;
    const q = resolveQuarter(quarter);
    (async () => {
      const { data, error } = await supabase
        .from("ingestion_runs")
        .select("status, message, started_at")
        .eq("source", "ga4")
        .eq("agency", agency)
        .eq("quarter", q.suffix)
        .eq("year", q.year)
        .order("started_at", { ascending: false })
        .limit(1);
      // A status line that cannot load its own status must not imply the sync
      // is fine, so it renders nothing at all rather than a reassuring tick.
      if (!cancelled) setRun(error ? null : (data?.[0] ?? null));
    })();
    return () => {
      cancelled = true;
    };
  }, [agency, quarter]);

  if (run === undefined) return null;
  const { tone, text } = describeRun(run);
  return (
    <div className={"admin-sync-status is-" + tone} role="status">
      {text}
    </div>
  );
}
