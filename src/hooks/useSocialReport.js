import { useState, useEffect } from "react";
import { SOCIAL_ENDPOINT, AGENCIES, QUARTERS } from "../config.js";
import { parseDelta } from "../utils.js";

const FLAT = { dir: "flat", pct: 0 };

function getQuarterBySuffix(suffix) {
  return QUARTERS.find(q => q.suffix === suffix) || QUARTERS[0];
}

function normalizeReport(raw, agency, quarter) {
  if (!raw) return null;

  // Pre-normalized shape
  if (raw.overall && raw.platforms) {
    const deltas = raw.deltas
      ? Object.fromEntries(Object.entries(raw.deltas).map(([k, v]) => [k, parseDelta(v)]))
      : {};
    const platforms = Array.isArray(raw.platforms)
      ? raw.platforms.map(p => ({
          ...p,
          followersDelta:      parseDelta(p.followersDelta),
          engagementRateDelta: parseDelta(p.engagementRateDelta),
          pageReachDelta:      parseDelta(p.pageReachDelta),
          pageClicksDelta:     parseDelta(p.pageClicksDelta),
        }))
      : raw.platforms;
    return { ...raw, deltas, platforms };
  }

  const overall = {}, deltas = {};
  const keyMap = {
    posts: "posts", impressions: "impressions", shares: "shares",
    reactions: "reactions", followers: "followers",
    linkClicks: "linkclicks", comments: "comments",
    avgEngagementRate: "avgengagementrate",
  };
  (raw.quarterTotals || []).forEach(row => {
    const key = keyMap[row.field] || row.field.toLowerCase();
    overall[key] = row.value;
    deltas[key]  = parseDelta(row.delta);
  });

  const platforms = (raw.platformBreakdown || []).map(p => ({
    key: p.Platform.toLowerCase(), name: p.Platform,
    followers: p.Followers,             followersDelta:      parseDelta(p["Followers Δ"]),
    engagementRate: p["Engagement Rate"], engagementRateDelta: parseDelta(p["ER Δ"]),
    pageReach: p.Reach,                  pageReachDelta:      parseDelta(p["Reach Δ"]),
    pageClicks: p.Clicks,                pageClicksDelta:     parseDelta(p["Clicks Δ"]),
    note: "",
  }));

  const byPlatform = { linkedin: [], facebook: [], instagram: [] };
  (raw.topPosts || []).forEach(p => {
    const key = (p.Platform || "").toLowerCase();
    if (byPlatform[key] && p.Title) {
      byPlatform[key].push({ title: p.Title, impressions: p.Impressions || 0, likes: p.Likes || 0, shares: p.Shares || 0 });
    }
  });

  const insightMap = {};
  (raw.insights || []).forEach(i => { insightMap[i.Section] = i.Text; });

  const notes = {
    working:    insightMap.working    ? [insightMap.working]    : [],
    notWorking: insightMap.notWorking ? [insightMap.notWorking] : [],
    actions:    insightMap.actions    ? [insightMap.actions]    : [],
    next:       insightMap.next       ? [insightMap.next]       : [],
  };

  const qMeta = getQuarterBySuffix(quarter);
  const NAMES = { isl: "Integrated Staffing", as: "Accountant Staffing", ads: "Administrative Staffing" };

  return {
    meta: {
      quarter:    qMeta.label,
      rangeLabel: qMeta.rangeLabel,
      year:       qMeta.year,
      agencyName: NAMES[agency] || "Integrated Staffing",
    },
    editorsNote:      (typeof raw.summary?.bullet === "string" && raw.summary.bullet.trim()) ? raw.summary.bullet.trim() : "",
    overall, deltas,
    platforms,
    topPostsByPlatform: byPlatform,
    notes,
    allPosts: raw.allPosts || [],
    weekly: Array.from({ length: 13 }, (_, i) => ({ wk: i + 1, imp: 0, leads: 0, spend: 0 })),
  };
}

export function useSocialReport(agency, quarter) {
  const [state, setState] = useState({ data: null, status: "loading", error: null });

  useEffect(() => {
    const reportKey = (AGENCIES[agency]?.prefix ?? agency) + quarter;
    const controller = new AbortController();
    setState({ data: null, status: "loading", error: null });

    (async () => {
      try {
        const res = await fetch(`${SOCIAL_ENDPOINT}?report=${reportKey}&t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        setState({ data: normalizeReport(raw, agency, quarter), status: "ready", error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState({ data: null, status: "error", error: err.message || "Failed to load report" });
      }
    })();

    return () => controller.abort();
  }, [agency, quarter]);

  return state;
}
