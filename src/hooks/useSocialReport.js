import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { AGENCIES, QUARTERS } from "../config.js";
import { calcAutoDelta } from "../utils.js";

function getQuarterMeta(suffix) {
  return QUARTERS.find(q => q.suffix === suffix) || QUARTERS[0];
}

function getPrevSuffix(suffix) {
  const idx = QUARTERS.findIndex(q => q.suffix === suffix);
  return idx >= 0 && idx < QUARTERS.length - 1 ? QUARTERS[idx + 1].suffix : null;
}

async function fetchReport(agency, quarter) {
  const { data, error } = await supabase
    .from("social_reports")
    .select(`
      id, editors_note,
      social_kpis(*),
      social_platforms(*),
      social_top_posts(*),
      social_posts(*),
      social_insights(*)
    `)
    .eq("agency", agency)
    .eq("quarter", quarter)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function normalize(report, agency, quarter, prev) {
  if (!report) return null;

  const qMeta   = getQuarterMeta(quarter);
  const kpis    = report.social_kpis?.[0]    || {};
  const prevKpi = prev?.social_kpis?.[0]     || null;

  const overall = {
    posts:             kpis.posts,
    impressions:       kpis.impressions,
    shares:            kpis.shares,
    reactions:         kpis.reactions,
    followers:         kpis.followers,
    linkclicks:        kpis.link_clicks,
    comments:          kpis.comments,
    avgengagementrate: kpis.avg_engagement_rate,
  };

  const deltas = {};
  if (prevKpi) {
    const prevOverall = {
      posts:             prevKpi.posts,
      impressions:       prevKpi.impressions,
      shares:            prevKpi.shares,
      reactions:         prevKpi.reactions,
      followers:         prevKpi.followers,
      linkclicks:        prevKpi.link_clicks,
      comments:          prevKpi.comments,
      avgengagementrate: prevKpi.avg_engagement_rate,
    };
    for (const key of Object.keys(overall)) {
      const d = calcAutoDelta(overall[key], prevOverall[key]);
      if (d) deltas[key] = d;
    }
  }

  const platforms = [...(report.social_platforms || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({
      key:                 p.name.toLowerCase(),
      name:                p.name,
      followers:           p.followers,
      followersDelta:      { dir: "flat", pct: 0 },
      engagementRate:      p.engagement_rate,
      engagementRateDelta: { dir: "flat", pct: 0 },
      pageReach:           p.page_reach,
      pageReachDelta:      { dir: "flat", pct: 0 },
      pageClicks:          p.page_clicks,
      pageClicksDelta:     { dir: "flat", pct: 0 },
      note:                p.note || "",
    }));

  const topPostsByPlatform = { linkedin: [], facebook: [], instagram: [] };
  for (const p of (report.social_top_posts || [])) {
    topPostsByPlatform[p.platform]?.push({
      title: p.title, impressions: p.impressions, likes: p.likes, shares: p.shares,
    });
  }

  const ins = report.social_insights?.[0] || {};
  const notes = {
    working:    ins.working      ? [ins.working]      : [],
    notWorking: ins.not_working  ? [ins.not_working]  : [],
    actions:    ins.actions      ? [ins.actions]      : [],
    next:       ins.next_quarter ? [ins.next_quarter] : [],
  };

  const allPosts = (report.social_posts || []).map(p => ({
    "Post Name":  p.post_name,
    Date:         p.post_date,
    Platforms:    p.platforms,
    Impressions:  p.impressions,
    Engagements:  p.engagements,
    URL:          p.url,
    Notes:        p.notes,
  }));

  return {
    meta: {
      quarter:    qMeta.label,
      rangeLabel: qMeta.rangeLabel,
      year:       qMeta.year,
      agencyName: AGENCIES[agency]?.name || "Integrated Staffing",
    },
    editorsNote: report.editors_note || "",
    overall,
    deltas,
    platforms,
    topPostsByPlatform,
    notes,
    allPosts,
    weekly: Array.from({ length: 13 }, (_, i) => ({ wk: i + 1, imp: 0, leads: 0, spend: 0 })),
  };
}

export function useSocialReport(agency, quarter) {
  const [state, setState] = useState({ data: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, status: "loading", error: null });

    (async () => {
      try {
        const prevSuffix = getPrevSuffix(quarter);
        const [report, prev] = await Promise.all([
          fetchReport(agency, quarter),
          prevSuffix ? fetchReport(agency, prevSuffix) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setState({ data: normalize(report, agency, quarter, prev), status: "ready", error: null });
        }
      } catch (err) {
        if (!cancelled) setState({ data: null, status: "error", error: err.message || "Failed to load report" });
      }
    })();

    return () => { cancelled = true; };
  }, [agency, quarter]);

  return state;
}
