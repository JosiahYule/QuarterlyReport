import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { AGENCIES, QUARTERS } from "../config.js";
import { calcAutoDelta, sumPaidMediaAds } from "../utils.js";
import { withRetry, friendlyError, getCached, setCached } from "../lib/fetching.js";
import { AUDIENCE_DIMENSIONS } from "../lib/linkedinDemographics.js";

function getQuarterMeta(suffix) {
  return QUARTERS.find(q => q.suffix === suffix) || QUARTERS[0];
}

function getPrevSuffix(suffix) {
  const idx = QUARTERS.findIndex(q => q.suffix === suffix);
  return idx >= 0 && idx < QUARTERS.length - 1 ? QUARTERS[idx + 1].suffix : null;
}

// Paid media lives under a social_reports row (a report is one row per
// agency+quarter), so the paid page fetches the same parent but selects only
// the campaign/ad branch it needs.
async function fetchPaid(agency, quarter) {
  const { data, error } = await supabase
    .from("social_reports")
    .select("id, paid_media_campaigns(*, paid_media_ads(*)), paid_media_demographics(*)")
    .eq("agency", agency)
    .eq("quarter", quarter)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function mapCampaigns(rawCampaigns) {
  return [...(rawCampaigns || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => {
      const ads = [...(c.paid_media_ads || [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(a => ({
          id: a.id,
          name: a.name,
          impressions: a.impressions,
          reach: a.reach,
          clicks: a.clicks,
          conversions: a.conversions,
          cpc: a.cpc,
          engagementRate: a.engagement_rate,
          status: a.status || "active",
        }));
      return {
        id: c.id,
        name: c.name,
        objective: c.objective || "",
        platform: c.platform || "",
        budget: typeof c.budget === "number" ? c.budget : null,
        startDate: c.start_date || null,
        endDate: c.end_date || null,
        ads,
        totals: sumPaidMediaAds(ads),
      };
    });
}

// Roll every ad up by the platform its campaign ran on. Campaigns with no
// platform recorded collapse into a single "Unspecified" group so their spend
// still shows up in the totals rather than silently vanishing.
function rollUpPlatforms(campaigns) {
  const groups = new Map();
  for (const c of campaigns) {
    const name = c.platform.trim() || "Unspecified";
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, ads: [], campaignCount: 0 });
    const g = groups.get(key);
    g.ads.push(...c.ads);
    g.campaignCount += 1;
  }
  return [...groups.values()]
    .map(g => ({ name: g.name, campaignCount: g.campaignCount, ...sumPaidMediaAds(g.ads) }))
    .sort((a, b) => (b.spend || 0) - (a.spend || 0) || (b.impressions || 0) - (a.impressions || 0));
}

// Group demographic rows into per-dimension panels, in the canonical
// dimension order. Segments sort by impressions (descending), each carrying
// its CTR and share of the dimension's impressions so the report can show
// both who saw the ads and who responded.
function rollUpAudience(rawRows) {
  const byDimension = new Map();
  for (const r of rawRows || []) {
    if (typeof r.impressions !== "number") continue;
    if (!byDimension.has(r.dimension)) byDimension.set(r.dimension, []);
    byDimension.get(r.dimension).push(r);
  }
  return AUDIENCE_DIMENSIONS
    .filter(d => byDimension.has(d.key))
    .map(d => {
      const rows = byDimension.get(d.key);
      const total = rows.reduce((a, r) => a + r.impressions, 0);
      const segments = rows
        .map(r => ({
          name: r.segment,
          impressions: r.impressions,
          clicks: typeof r.clicks === "number" ? r.clicks : null,
          ctr: typeof r.clicks === "number" && r.impressions > 0
            ? (r.clicks / r.impressions) * 100
            : null,
          share: total > 0 ? (r.impressions / total) * 100 : null,
        }))
        .sort((a, b) => b.impressions - a.impressions);
      return { dimension: d.key, label: d.label, totalImpressions: total, segments };
    });
}

function normalize(report, agency, quarter, prev) {
  const qMeta = getQuarterMeta(quarter);
  const campaigns = mapCampaigns(report?.paid_media_campaigns);
  const audience = rollUpAudience(report?.paid_media_demographics);
  const totals = sumPaidMediaAds(campaigns.flatMap(c => c.ads));

  const prevCampaigns = mapCampaigns(prev?.paid_media_campaigns);
  const prevTotals = sumPaidMediaAds(prevCampaigns.flatMap(c => c.ads));
  const deltas = {};
  for (const key of Object.keys(totals)) {
    const d = calcAutoDelta(totals[key], prevTotals[key]);
    if (d) deltas[key] = d;
  }

  return {
    meta: {
      quarter:    qMeta.label,
      rangeLabel: qMeta.rangeLabel,
      year:       qMeta.year,
      agencyName: AGENCIES[agency]?.name || "Integrated Staffing",
    },
    campaigns,
    totals,
    deltas,
    platforms: rollUpPlatforms(campaigns),
    audience,
    hasData: campaigns.length > 0 || audience.length > 0,
  };
}

export function usePaidReport(agency, quarter, retryKey = 0) {
  const [state, setState] = useState({ data: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `paid:${agency}:${quarter}`;
    const cached = getCached(cacheKey);

    // Serve the last good copy instantly, revalidate in the background
    setState(cached !== undefined
      ? { data: cached, status: "ready", error: null }
      : { data: null, status: "loading", error: null });

    (async () => {
      try {
        const prevSuffix = getPrevSuffix(quarter);
        const [report, prev] = await Promise.all([
          withRetry(() => fetchPaid(agency, quarter)),
          prevSuffix ? withRetry(() => fetchPaid(agency, prevSuffix)) : Promise.resolve(null),
        ]);
        const data = report ? normalize(report, agency, quarter, prev) : null;
        setCached(cacheKey, data);
        if (!cancelled) setState({ data, status: "ready", error: null });
      } catch (err) {
        // Keep showing stale data on a failed background refresh
        if (!cancelled && cached === undefined) {
          setState({ data: null, status: "error", error: friendlyError(err) });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [agency, quarter, retryKey]);

  return state;
}
