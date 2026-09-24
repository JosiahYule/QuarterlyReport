import { supabase } from "../lib/supabase.js";
import { resolveQuarter, previousQuarter } from "../config.js";
import { withRetry, useCachedResource, oneRow } from "../lib/fetching.js";

async function fetchReport(agency, q) {
  const { data, error } = await supabase
    .from("web_reports")
    .select(
      `
      id, summary_bullet,
      web_kpis(*),
      web_channels(*),
      web_pages(*),
      web_insights(*)
    `
    )
    .eq("agency", agency)
    .eq("quarter", q.suffix)
    .eq("year", q.year)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function normalize(report) {
  if (!report) return null;
  const kpis = oneRow(report.web_kpis) || {};
  const ins = oneRow(report.web_insights) || {};
  return {
    summary: { bullet: report.summary_bullet || "" },
    overall: {
      sessions: kpis.sessions,
      users: kpis.users,
      engagementRate: kpis.engagement_rate,
      avgEngagementTimeSec: kpis.avg_engagement_time_sec,
      actions: kpis.actions,
      formSubmissions: kpis.form_submissions,
    },
    channels: [...(report.web_channels || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        name: c.name,
        sessions: c.sessions,
        shareOfTraffic: c.share_of_traffic,
        engagementRate: c.engagement_rate,
      })),
    topPages: [...(report.web_pages || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        key: p.key,
        pageViews: p.page_views,
        bounceRate: p.bounce_rate,
        avgTimeOnPageSec: p.avg_time_on_page_sec,
      })),
    insights: {
      working: ins.working || "",
      notWorking: ins.not_working || "",
      actions: ins.actions || "",
      next: ins.next_quarter || "",
    },
  };
}

// The selected quarter and the one before it, whose figures the page shows
// deltas against.
export function useWebReport(agency, quarter, retryKey = 0) {
  const q = resolveQuarter(quarter);
  const {
    data: pair,
    status,
    error,
  } = useCachedResource(
    `web:${agency}:${q.id}`,
    async () => {
      const [report, prevReport] = await Promise.all([
        withRetry(() => fetchReport(agency, q)),
        withRetry(() => fetchReport(agency, previousQuarter(q))),
      ]);
      return { data: normalize(report), prevData: normalize(prevReport) };
    },
    retryKey
  );
  return { data: pair?.data ?? null, prevData: pair?.prevData ?? null, status, error };
}
