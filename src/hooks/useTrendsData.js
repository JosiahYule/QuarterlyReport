import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { TRENDS_QUARTERS, CURRENT_QUARTER, AGENCIES } from "../config.js";
import { METRICS, extractMetric } from "../lib/projection.js";
import { withRetry, friendlyError } from "../lib/fetching.js";

// Re-export the pure projection math so existing consumers (TrendsPage,
// tests) keep importing from this module. The maths now lives in
// ../lib/projection.js, free of the Supabase client, so it can be
// unit-tested and back-tested in isolation.
export {
  METRICS,
  extractMetric,
  computeAdvancedPace,
  getMetricHistory,
  getWeekAgoProjection,
  getProjectionTimeline,
  clampCalibrationFactor,
  buildProjectionAudit,
  buildProjectionAudits,
  quarterCompletion,
  quarterComplete,
} from "../lib/projection.js";

// ─── History: Supabase persistence ───────────────────────────────
async function storeSnapshot(agency, d3) {
  if (!d3) return;
  const vals = {};
  for (const m of METRICS) {
    if (!m.isPace) continue;
    const v = extractMetric(d3, m);
    if (v !== null) vals[m.id] = v;
  }
  if (!Object.keys(vals).length) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from("projection_snapshots").upsert(
      { agency, quarter: CURRENT_QUARTER.suffix, snapshot_date: today, captured_at: new Date().toISOString(), vals },
      { onConflict: "agency,quarter,snapshot_date" }
    );
  } catch (_) {}
}

async function loadSnapshots(agency, quarterSuffix) {
  try {
    const { data, error } = await supabase
      .from("projection_snapshots")
      .select("captured_at, vals")
      .eq("agency", agency)
      .eq("quarter", quarterSuffix)
      .order("snapshot_date", { ascending: true });
    if (error || !data) return [];
    return data.map(row => ({ t: new Date(row.captured_at).getTime(), vals: row.vals }));
  } catch (_) {
    return [];
  }
}

// ─── Hook ─────────────────────────────────────────────────────────
async function fetchQuarter(agency, quarter) {
  try {
    const { data, error } = await withRetry(() => supabase
      .from("social_reports")
      .select("social_kpis(*)")
      .eq("agency", agency)
      .eq("quarter", quarter)
      .maybeSingle());
    if (error) throw error;
    if (!data) return null;
    const k = data.social_kpis?.[0] || {};
    return {
      overall: {
        posts:       k.posts,
        impressions: k.impressions,
        shares:      k.shares,
        reactions:   k.reactions,
        followers:   k.followers,
        linkclicks:  k.link_clicks,
        comments:    k.comments,
      },
    };
  } catch (_) {
    return null;
  }
}

// Write today's snapshot for *every* agency's current quarter, not just the
// one being viewed. Snapshots are only ever recorded from this page, so an
// agency whose Trends tab nobody opens would otherwise build no projection
// history. Fire-and-forget: fetchQuarter/storeSnapshot swallow their own
// errors, and agencies with no current-quarter data are skipped.
async function snapshotAllAgencies() {
  await Promise.all(
    Object.keys(AGENCIES).map((a) =>
      fetchQuarter(a, CURRENT_QUARTER.suffix).then((d) => storeSnapshot(a, d))
    )
  );
}

export function useTrendsData(agency) {
  const [state, setState] = useState({ qdata: null, snapsByQuarter: {}, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [qdata, ...snapsArrays] = await Promise.all([
          Promise.all(TRENDS_QUARTERS.map(q => fetchQuarter(agency, q.suffix))),
          ...TRENDS_QUARTERS.map(q => loadSnapshots(agency, q.suffix)),
        ]);

        if (!cancelled) {
          const snapsByQuarter = Object.fromEntries(
            TRENDS_QUARTERS.map((q, i) => [q.suffix, snapsArrays[i]])
          );
          // Fire-and-forget: snapshot every agency's current quarter (not just
          // the one being viewed) so each one accrues projection history.
          snapshotAllAgencies();
          setState({ qdata, snapsByQuarter, status: "ready", error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState(s => s.status === "loading"
            ? { qdata: null, snapsByQuarter: {}, status: "error", error: friendlyError(err) }
            : s);
        }
      }
    };

    setState({ qdata: null, snapsByQuarter: {}, status: "loading", error: null });
    run();
    // Refresh every 5 minutes, but only while the tab is visible
    const id = setInterval(() => { if (!document.hidden) run(); }, 300_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [agency]);

  return state;
}
