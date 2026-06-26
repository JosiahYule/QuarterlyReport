import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { TRENDS_QUARTERS, CURRENT_QUARTER, AGENCIES } from "../config.js";
import { METRICS, extractMetric, buildProjectionAudits } from "../lib/projection.js";
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
  annotateTimelineSpikes,
  projectionBand,
  clampCalibrationFactor,
  buildProjectionAudit,
  buildProjectionAudits,
  blendCalibrationHistory,
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

// Persist this quarter's audit of *last* quarter's projection accuracy, so
// the calibration factor can compound across many quarters instead of being
// re-derived from scratch (and forgotten) on every page load. No-ops until
// the previous quarter is complete (buildProjectionAudits returns {} before
// then) and is a plain upsert otherwise, so re-running it on every refresh
// is harmless.
async function storeAudits(agency, qdata, snapsByQuarter) {
  const audits = buildProjectionAudits(qdata, snapsByQuarter);
  const previousQuarter = TRENDS_QUARTERS[1];
  const rows = Object.entries(audits)
    .filter(([, audit]) => audit)
    .map(([metricId, audit]) => ({
      agency,
      quarter: previousQuarter.suffix,
      year: previousQuarter.year,
      metric_id: metricId,
      actual: audit.actual,
      avg_projected: audit.avgProjected,
      percent_error: audit.percentError,
      accuracy_ratio: audit.accuracyRatio,
      calibration_confidence: audit.calibrationConfidence,
      calibration_factor: audit.calibrationFactor,
      sample_count: audit.sampleCount,
      first_day: audit.firstDay,
      last_day: audit.lastDay,
      computed_at: new Date().toISOString(),
    }));
  if (!rows.length) return;
  try {
    await supabase.from("projection_audits").upsert(rows, { onConflict: "agency,quarter,year,metric_id" });
  } catch (_) {}
}

// Fire-and-forget audit persistence for every agency's current quarter,
// mirroring snapshotAllAgencies below: the Trends page is the only place
// this runs, so an agency nobody views would otherwise never accrue audit
// history.
async function auditAllAgencies() {
  await Promise.all(
    Object.keys(AGENCIES).map(async (a) => {
      const qdata = await Promise.all(TRENDS_QUARTERS.map(q => fetchQuarter(a, q.suffix)));
      const snaps = await loadSnapshots(a, TRENDS_QUARTERS[1].suffix);
      await storeAudits(a, qdata, { [TRENDS_QUARTERS[1].suffix]: snaps });
    })
  );
}

// Last N persisted audits for one agency/metric, most-recent-first, for
// blendCalibrationHistory to weight by recency.
async function loadCalibrationHistory(agency, metricId, limit = 4) {
  try {
    const { data, error } = await supabase
      .from("projection_audits")
      .select("calibration_factor, calibration_confidence, percent_error, computed_at")
      .eq("agency", agency)
      .eq("metric_id", metricId)
      .order("computed_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data;
  } catch (_) {
    return [];
  }
}

// Top post and platform leader/laggard for the viewed agency's current
// quarter, to auto-surface "what's driving this" without anyone having to
// curate it. Scoped to the single viewed agency (unlike snapshotAllAgencies/
// auditAllAgencies above) since this only feeds a display widget, not an
// accumulating history.
async function fetchDrivers(agency, quarterSuffix) {
  try {
    const { data, error } = await supabase
      .from("social_reports")
      .select("social_posts(post_name, post_date, platforms, impressions, engagements, url), social_platforms(name, engagement_rate)")
      .eq("agency", agency)
      .eq("quarter", quarterSuffix)
      .maybeSingle();
    if (error || !data) return { topPost: null, platformLeader: null, platformLaggard: null, posts: [] };

    const posts = (data.social_posts || []).filter(p => Number.isFinite(p.impressions));
    const topPost = posts.length
      ? posts.reduce((best, p) => p.impressions > best.impressions ? p : best)
      : null;

    const platforms = (data.social_platforms || []).filter(p => Number.isFinite(p.engagement_rate));
    const platformLeader = platforms.length
      ? platforms.reduce((best, p) => p.engagement_rate > best.engagement_rate ? p : best)
      : null;
    const platformLaggard = platforms.length > 1
      ? platforms.reduce((worst, p) => p.engagement_rate < worst.engagement_rate ? p : worst)
      : null;

    // Full post list (with dates) so the trajectory chart can tie a projection
    // spike to whatever post landed as the metric accelerated.
    return { topPost, platformLeader, platformLaggard, posts };
  } catch (_) {
    return { topPost: null, platformLeader: null, platformLaggard: null, posts: [] };
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
  const [state, setState] = useState({ qdata: null, snapsByQuarter: {}, calibrationHistory: {}, drivers: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [qdata, drivers, ...rest] = await Promise.all([
          Promise.all(TRENDS_QUARTERS.map(q => fetchQuarter(agency, q.suffix))),
          fetchDrivers(agency, TRENDS_QUARTERS[2].suffix),
          ...TRENDS_QUARTERS.map(q => loadSnapshots(agency, q.suffix)),
          ...METRICS.map(m => loadCalibrationHistory(agency, m.id)),
        ]);
        const snapsArrays = rest.slice(0, TRENDS_QUARTERS.length);
        const historyArrays = rest.slice(TRENDS_QUARTERS.length);

        if (!cancelled) {
          const snapsByQuarter = Object.fromEntries(
            TRENDS_QUARTERS.map((q, i) => [q.suffix, snapsArrays[i]])
          );
          const calibrationHistory = Object.fromEntries(
            METRICS.map((m, i) => [m.id, historyArrays[i]])
          );
          // Fire-and-forget: snapshot every agency's current quarter, and
          // persist an audit of last quarter's projection accuracy for every
          // agency, not just the one being viewed — so each one accrues
          // history regardless of whose Trends tab gets opened.
          snapshotAllAgencies();
          auditAllAgencies();
          setState({ qdata, snapsByQuarter, calibrationHistory, drivers, status: "ready", error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState(s => s.status === "loading"
            ? { qdata: null, snapsByQuarter: {}, calibrationHistory: {}, drivers: null, status: "error", error: friendlyError(err) }
            : s);
        }
      }
    };

    setState({ qdata: null, snapsByQuarter: {}, calibrationHistory: {}, drivers: null, status: "loading", error: null });
    run();
    // Refresh every 5 minutes, but only while the tab is visible
    const id = setInterval(() => { if (!document.hidden) run(); }, 300_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [agency]);

  return state;
}
