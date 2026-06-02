import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { AGENCIES, TRENDS_QUARTERS, CURRENT_QUARTER } from "../config.js";
import { toNumber, nfk } from "../utils.js";

// ─── Metric definitions ────────────────────────────────────────────
export const METRICS = [
  { id: "impressions", label: "Impressions",     needles: ["post impressions","impressions"],                                         isPercent: false, isPace: true, postsMultiplier: true },
  { id: "reactions",   label: "Reactions",        needles: ["reactions and likes","reactions & likes","reactions","likes"],            isPercent: false, isPace: true, postsMultiplier: true },
  { id: "linkclicks",  label: "Link Clicks",      needles: ["post link clicks","link clicks","clicks"],                                isPercent: false, isPace: true, postsMultiplier: true },
  { id: "shares",      label: "Shares",           needles: ["post shares","shares"],                                                   isPercent: false, isPace: true, postsMultiplier: true },
  { id: "comments",    label: "Comments",         needles: ["comments and replies","comments & replies","comments","replies"],         isPercent: false, isPace: true, postsMultiplier: true },
  { id: "posts",       label: "Posts Published",  needles: ["posts"],                                                                  isPercent: false, isPace: true },
  { id: "followers",   label: "Followers",        needles: ["followers total","followers (total)","followers"],                        isPercent: false, isPace: true, baselineFromQ2: true },
];

// ─── Extraction helpers ────────────────────────────────────────────
function extractFromRows(rows, metric) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const map = {};
  for (const r of rows) {
    const raw = r.field ?? r.Field ?? r.name ?? r.Name ?? "";
    const k = nfk(raw);
    if (k) map[k] = r.value ?? r.Value ?? null;
  }
  for (const n of metric.needles) {
    const k = nfk(n);
    if (map[k] !== undefined) return toNumber(map[k]);
  }
  const keys = Object.keys(map);
  for (const n of metric.needles) {
    const nl = nfk(n);
    const hit = keys.find(k => k.includes(nl));
    if (hit !== undefined) return toNumber(map[hit]);
  }
  return null;
}

function extractFromOverall(overall, metric) {
  if (!overall || typeof overall !== "object" || Array.isArray(overall)) return null;
  const direct = { impressions: "impressions", reactions: "reactions", linkclicks: "linkclicks", shares: "shares", comments: "comments", posts: "posts", followers: "followers" };
  const k = direct[metric.id];
  return k && overall[k] !== undefined ? toNumber(overall[k]) : null;
}

export function extractMetric(data, metric) {
  if (!data) return null;
  if (data.quarterTotals) { const v = extractFromRows(data.quarterTotals, metric); if (v !== null) return v; }
  if (data.overall)       { const v = extractFromOverall(data.overall, metric);    if (v !== null) return v; }
  return null;
}

// ─── Pace projection ──────────────────────────────────────────────
export function computeAdvancedPace(current, qStart, qEnd, q2Rate, metricHistory, histBaseline = 0, asOfDate = new Date(), calibrationFactor = 1) {
  if (current === null || !Number.isFinite(current)) return null;
  const now = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  const dElapsed = (now - qStart) / 86400000;
  if (dElapsed < 7) return null;
  const dTotal = (qEnd - qStart) / 86400000;
  const dRemaining = dTotal - dElapsed;
  const simpleRate = current / dElapsed;
  const simpleProj = simpleRate * dTotal;

  let rollingProj = null, rollingRate = null;
  if (metricHistory.length >= 2) {
    const cutoff = now.getTime() - 7 * 86400000;
    const windowStart = metricHistory.find(s => s.t >= cutoff) || metricHistory[0];
    const latest = metricHistory[metricHistory.length - 1];
    const dt = (latest.t - windowStart.t) / 86400000;
    if (dt >= 1) {
      const vS = windowStart.val - histBaseline, vE = latest.val - histBaseline;
      if (Number.isFinite(vS) && Number.isFinite(vE) && vE >= vS) {
        rollingRate = (vE - vS) / dt;
        rollingProj = Math.max(current, current + rollingRate * dRemaining);
      }
    }
  }

  let regProj = null;
  if (metricHistory.length >= 3) {
    const pts = metricHistory
      .map(s => ({ x: (s.t - qStart.getTime()) / 86400000, y: s.val - histBaseline }))
      .filter(p => p.x >= 0 && Number.isFinite(p.y) && p.y >= 0);
    if (pts.length >= 3) {
      const n = pts.length, sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
      const sxy = pts.reduce((a, p) => a + p.x * p.y, 0), sx2 = pts.reduce((a, p) => a + p.x * p.x, 0);
      const den = n * sx2 - sx * sx;
      if (den !== 0) {
        const slope = (n * sxy - sx * sy) / den, intercept = (sy - slope * sx) / n;
        const r = intercept + slope * dTotal;
        if (r > 0) regProj = r;
      }
    }
  }

  let blended;
  if (regProj !== null && rollingProj !== null)  blended = 0.20 * simpleProj + 0.40 * rollingProj + 0.40 * regProj;
  else if (regProj !== null)                     blended = 0.40 * simpleProj + 0.60 * regProj;
  else if (rollingProj !== null)                 blended = 0.35 * simpleProj + 0.65 * rollingProj;
  else                                           blended = simpleProj;

  const confidence = Math.min(1, dElapsed / 14);
  const rawProjected = q2Rate !== null && Number.isFinite(q2Rate) && q2Rate > 0
    ? confidence * blended + (1 - confidence) * (q2Rate * dTotal)
    : blended;
  const safeCalibration = Number.isFinite(calibrationFactor) && calibrationFactor > 0 ? calibrationFactor : 1;
  const projected = rawProjected * safeCalibration;

  return { projected, rawProjected, dailyRate: rollingRate ?? simpleRate, dElapsed, dTotal, calibrationFactor: safeCalibration };
}

// ─── History persistence ──────────────────────────────────────────
export function getHistoryKey(agency, quarter = CURRENT_QUARTER) { return `${agency}${quarter.suffix}_proj_history`; }

export function storeSnapshot(agency, d3) {
  if (!d3) return;
  const snap = { t: Date.now(), vals: {} };
  for (const m of METRICS) {
    if (!m.isPace) continue;
    const v = extractMetric(d3, m);
    if (v !== null) snap.vals[m.id] = v;
  }
  if (!Object.keys(snap.vals).length) return;
  try {
    const raw = localStorage.getItem(getHistoryKey(agency));
    const hist = raw ? JSON.parse(raw) : [];
    hist.push(snap);
    localStorage.setItem(getHistoryKey(agency), JSON.stringify(hist.slice(-500)));
  } catch (e) {}
}

export function loadHistory(agency, quarter = CURRENT_QUARTER) {
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(getHistoryKey(agency, quarter)) || "[]"); } catch { return []; }
  const byDay = {};
  for (const snap of hist) byDay[new Date(snap.t).toDateString()] = snap;
  return Object.values(byDay).sort((a, b) => a.t - b.t);
}

export function getMetricHistory(agency, metricId, quarter = CURRENT_QUARTER) {
  return loadHistory(agency, quarter)
    .filter(s => s.vals && s.vals[metricId] !== undefined)
    .map(s => ({ t: s.t, val: s.vals[metricId] }))
    .sort((a, b) => a.t - b.t);
}

export function clampCalibrationFactor(factor) {
  if (!Number.isFinite(factor) || factor <= 0) return 1;
  return Math.min(1.5, Math.max(0.5, factor));
}

export function buildProjectionAudit({ agency, metric, actualValue, completedQuarter, previousQuarter, previousQuarterValue, twoBackValue }) {
  if (!metric?.isPace || actualValue === null || previousQuarterValue === null) return null;

  const previousDays = (previousQuarter.end - previousQuarter.start) / 86400000;
  const previousInput = metric.baselineFromQ2
    ? (twoBackValue != null ? previousQuarterValue - twoBackValue : null)
    : previousQuarterValue;
  const previousRate = previousInput !== null && Number.isFinite(previousInput)
    ? previousInput / previousDays
    : null;
  const actualInput = metric.baselineFromQ2 ? actualValue - previousQuarterValue : actualValue;
  if (!Number.isFinite(actualInput) || actualInput < 0) return null;

  const histBaseline = metric.baselineFromQ2 ? previousQuarterValue : 0;
  const quarterStart = completedQuarter.start.getTime();
  const quarterEnd = completedQuarter.end.getTime();
  const metricHistory = getMetricHistory(agency, metric.id, completedQuarter)
    .filter(s => s.t >= quarterStart && s.t < quarterEnd && Number.isFinite(s.val));

  const samples = [];
  for (const sample of metricHistory) {
    const sampleInput = metric.baselineFromQ2 ? sample.val - previousQuarterValue : sample.val;
    if (!Number.isFinite(sampleInput) || sampleInput < 0) continue;
    const sampleHistory = metricHistory.filter(s => s.t <= sample.t);
    const pace = computeAdvancedPace(
      sampleInput,
      completedQuarter.start,
      completedQuarter.end,
      previousRate,
      sampleHistory,
      histBaseline,
      new Date(sample.t)
    );
    if (pace?.projected !== null && Number.isFinite(pace.projected) && pace.projected > 0) {
      samples.push({ t: sample.t, projected: pace.projected, day: Math.round(pace.dElapsed) });
    }
  }

  if (!samples.length) return null;
  const avgProjected = samples.reduce((sum, s) => sum + s.projected, 0) / samples.length;
  const error = avgProjected - actualInput;
  const percentError = actualInput !== 0 ? error / actualInput * 100 : null;
  const accuracyRatio = avgProjected > 0 ? actualInput / avgProjected : 1;
  const calibrationFactor = clampCalibrationFactor(accuracyRatio);

  return {
    actual: actualInput,
    avgProjected,
    error,
    percentError,
    accuracyRatio,
    calibrationFactor,
    sampleCount: samples.length,
    firstDay: samples[0]?.day ?? null,
    lastDay: samples[samples.length - 1]?.day ?? null,
  };
}

export function buildProjectionAudits(agency, qdata, quarters = TRENDS_QUARTERS) {
  if (!Array.isArray(qdata) || qdata.length < 3 || !Array.isArray(quarters) || quarters.length < 3) return {};
  const [twoBackData, previousData] = qdata;
  const [twoBackQuarter, previousQuarter, currentQuarter] = quarters;
  if (!quarterComplete(previousQuarter) || !currentQuarter) return {};

  return Object.fromEntries(METRICS.map(metric => {
    const audit = buildProjectionAudit({
      agency,
      metric,
      actualValue: extractMetric(previousData, metric),
      completedQuarter: previousQuarter,
      previousQuarter: twoBackQuarter,
      previousQuarterValue: extractMetric(twoBackData, metric),
      twoBackValue: null,
    });
    return [metric.id, audit];
  }));
}

// ─── Quarter completion ───────────────────────────────────────────
export function quarterCompletion(q) {
  const now = new Date();
  if (now >= q.end)   return 1;
  if (now < q.start)  return 0;
  return (now - q.start) / (q.end - q.start);
}

export function quarterComplete(q) { return new Date() >= q.end; }

// ─── Hook ─────────────────────────────────────────────────────────
async function fetchQuarter(agency, quarter) {
  try {
    const { data, error } = await supabase
      .from("social_reports")
      .select("social_kpis(*)")
      .eq("agency", agency)
      .eq("quarter", quarter)
      .maybeSingle();
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
  } catch (e) {
    return null;
  }
}

export function useTrendsData(agency) {
  const [state, setState] = useState({ qdata: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const qdata = await Promise.all(TRENDS_QUARTERS.map(q => fetchQuarter(agency, q.suffix)));
        if (!cancelled) {
          storeSnapshot(agency, qdata[2]);
          setState({ qdata, status: "ready", error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState(s => s.status === "loading"
            ? { qdata: null, status: "error", error: err.message }
            : s);
        }
      }
    };

    setState({ qdata: null, status: "loading", error: null });
    run();
    const id = setInterval(run, 300_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [agency]);

  return state;
}
