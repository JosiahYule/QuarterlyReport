import { supabase } from "../lib/supabase.js";
import { AGENCIES, resolveQuarter, previousQuarter } from "../config.js";
import { withRetry, useCachedResource, oneRow } from "../lib/fetching.js";
import { quarterCoverage, compareMetric, TOTAL, LEVEL, UNIQUE } from "../lib/quarterProgress.js";

// The previous quarter is only read for its deltas, so it skips the post log
// and insights, which are most of a report's weight.
const REPORT_SELECT =
  "id, editors_note, updated_at, social_kpis(*), social_platforms(*), social_posts(*), social_insights(*)";
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

// How each headline KPI behaves part way through a quarter (see
// lib/quarterProgress.js): totals are compared at their pace, while followers
// and the engagement rate mean the same on any day and are compared as they
// stand.
export const SOCIAL_KPI_KINDS = {
  posts: TOTAL,
  impressions: TOTAL,
  shares: TOTAL,
  reactions: TOTAL,
  followers: LEVEL,
  linkclicks: TOTAL,
  comments: TOTAL,
  avgengagementrate: LEVEL,
};

// A table cell has no room to say "on pace", and a paced figure read as a raw
// one is its own kind of misleading, so tables show only comparisons that are
// fair as they stand.
function cellDelta(kind, cur, prev, coverage) {
  const c = compareMetric(kind, cur, prev, coverage);
  return c.paced ? null : c.delta;
}

function normalize(report, agency, q, prev) {
  if (!report) return null;

  const coverage = quarterCoverage(q, report.updated_at);
  const overall = socialKpis(oneRow(report.social_kpis)) || {};
  const prevOverall = socialKpis(oneRow(prev?.social_kpis));

  // deltas: the badge for each KPI. pace: the projected finish behind any
  // badge that compares a pace, so the card can say what it was compared at.
  const deltas = {};
  const pace = {};
  if (prevOverall) {
    for (const key of Object.keys(overall)) {
      const c = compareMetric(SOCIAL_KPI_KINDS[key] ?? LEVEL, overall[key], prevOverall[key], coverage);
      if (c.delta) deltas[key] = c.delta;
      if (c.paced) pace[key] = c.projected;
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
        followersDelta: cellDelta(LEVEL, p.followers, pp?.followers, coverage),
        engagementRate: p.engagement_rate,
        engagementRateDelta: cellDelta(LEVEL, p.engagement_rate, pp?.engagement_rate, coverage),
        pageReach: p.page_reach,
        pageReachDelta: cellDelta(UNIQUE, p.page_reach, pp?.page_reach, coverage),
        pageClicks: p.page_clicks,
        pageClicksDelta: cellDelta(TOTAL, p.page_clicks, pp?.page_clicks, coverage),
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
    coverage,
    overall,
    deltas,
    pace,
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
