import { supabase } from "../lib/supabase.js";
import { AGENCIES, resolveQuarter, previousQuarter } from "../config.js";
import { calcAutoDelta } from "../utils.js";
import { withRetry, useCachedResource, oneRow } from "../lib/fetching.js";

// The previous quarter is only read for its deltas, so it skips the post log
// and insights, which are most of a report's weight.
const REPORT_SELECT =
  "id, editors_note, social_kpis(*), social_platforms(*), social_posts(*), social_insights(*)";
const PREV_SELECT = "id, social_kpis(*), social_platforms(*)";

async function fetchReport(agency, q, select = REPORT_SELECT) {
  const { data, error } = await supabase
    .from("social_reports")
    .select(select)
    .eq("agency", agency)
    .eq("quarter", q.suffix)
    .eq("year", q.year)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// A social_kpis row in the shape the report pages use, or null.
export function socialKpis(row) {
  if (!row) return null;
  return {
    posts: row.posts,
    impressions: row.impressions,
    shares: row.shares,
    reactions: row.reactions,
    followers: row.followers,
    linkclicks: row.link_clicks,
    comments: row.comments,
    avgengagementrate: row.avg_engagement_rate,
  };
}

function normalize(report, agency, q, prev) {
  if (!report) return null;

  const overall = socialKpis(oneRow(report.social_kpis)) || {};
  const prevOverall = socialKpis(oneRow(prev?.social_kpis));

  const deltas = {};
  if (prevOverall) {
    for (const key of Object.keys(overall)) {
      const d = calcAutoDelta(overall[key], prevOverall[key]);
      if (d) deltas[key] = d;
    }
  }

  const prevPlatformMap = {};
  for (const p of prev?.social_platforms || []) {
    prevPlatformMap[p.name.toLowerCase()] = p;
  }

  const platforms = [...(report.social_platforms || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => {
      const pp = prevPlatformMap[p.name.toLowerCase()];
      return {
        key: p.name.toLowerCase(),
        name: p.name,
        followers: p.followers,
        followersDelta: calcAutoDelta(p.followers, pp?.followers),
        engagementRate: p.engagement_rate,
        engagementRateDelta: calcAutoDelta(p.engagement_rate, pp?.engagement_rate),
        pageReach: p.page_reach,
        pageReachDelta: calcAutoDelta(p.page_reach, pp?.page_reach),
        pageClicks: p.page_clicks,
        pageClicksDelta: calcAutoDelta(p.page_clicks, pp?.page_clicks),
        note: p.note || "",
      };
    });

  const ins = oneRow(report.social_insights) || {};
  const notes = {
    working: ins.working ? [ins.working] : [],
    notWorking: ins.not_working ? [ins.not_working] : [],
    actions: ins.actions ? [ins.actions] : [],
    next: ins.next_quarter ? [ins.next_quarter] : [],
  };

  const allPosts = (report.social_posts || []).map((p) => ({
    "Post Name": p.post_name,
    Date: p.post_date,
    Platforms: p.platforms,
    Impressions: p.impressions,
    Engagements: p.engagements,
    URL: p.url,
    Notes: p.notes,
  }));

  return {
    meta: {
      quarter: q.label,
      rangeLabel: q.rangeLabel,
      agencyName: AGENCIES[agency]?.name || "Integrated Staffing",
    },
    editorsNote: report.editors_note || "",
    overall,
    deltas,
    platforms,
    notes,
    allPosts,
  };
}

export function useSocialReport(agency, quarter, retryKey = 0) {
  const q = resolveQuarter(quarter);
  return useCachedResource(
    `social:${agency}:${q.id}`,
    async () => {
      const [report, prev] = await Promise.all([
        withRetry(() => fetchReport(agency, q)),
        withRetry(() => fetchReport(agency, previousQuarter(q), PREV_SELECT)),
      ]);
      return normalize(report, agency, q, prev);
    },
    retryKey
  );
}
