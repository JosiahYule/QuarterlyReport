import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { QUARTERS } from "../config.js";
import { withRetry, friendlyError, getCached, setCached } from "../lib/fetching.js";

function getPrevSuffix(suffix) {
  const idx = QUARTERS.findIndex(q => q.suffix === suffix);
  return idx >= 0 && idx < QUARTERS.length - 1 ? QUARTERS[idx + 1].suffix : null;
}

async function fetchReport(agency, quarter) {
  const { data, error } = await supabase
    .from("web_reports")
    .select(`
      id, summary_bullet,
      web_kpis(*),
      web_channels(*),
      web_pages(*),
      web_insights(*)
    `)
    .eq("agency", agency)
    .eq("quarter", quarter)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function normalize(report) {
  if (!report) return null;
  const kpis = report.web_kpis?.[0]    || {};
  const ins  = report.web_insights?.[0] || {};
  return {
    summary: { bullet: report.summary_bullet || "" },
    overall: {
      sessions:             kpis.sessions,
      users:                kpis.users,
      engagementRate:       kpis.engagement_rate,
      avgEngagementTimeSec: kpis.avg_engagement_time_sec,
      actions:              kpis.actions,
      formSubmissions:      kpis.form_submissions,
    },
    deltas: {},
    channels: [...(report.web_channels || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({
        name:           c.name,
        sessions:       c.sessions,
        shareOfTraffic: c.share_of_traffic,
        engagementRate: c.engagement_rate,
      })),
    topPages: [...(report.web_pages || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(p => ({
        key:              p.key,
        pageViews:        p.page_views,
        bounceRate:       p.bounce_rate,
        avgTimeOnPageSec: p.avg_time_on_page_sec,
      })),
    insights: {
      working:    ins.working      || "",
      notWorking: ins.not_working  || "",
      actions:    ins.actions      || "",
      next:       ins.next_quarter || "",
    },
  };
}

export function useWebReport(agency, quarter, retryKey = 0) {
  const [state, setState] = useState({ data: null, prevData: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `web:${agency}:${quarter}`;
    const cached = getCached(cacheKey);

    // Serve the last good copy instantly, revalidate in the background
    setState(cached !== undefined
      ? { ...cached, status: "ready", error: null }
      : { data: null, prevData: null, status: "loading", error: null });

    (async () => {
      try {
        const prevSuffix = getPrevSuffix(quarter);
        const [report, prevReport] = await Promise.all([
          withRetry(() => fetchReport(agency, quarter)),
          prevSuffix ? withRetry(() => fetchReport(agency, prevSuffix)) : Promise.resolve(null),
        ]);
        const payload = { data: normalize(report), prevData: normalize(prevReport) };
        setCached(cacheKey, payload);
        if (!cancelled) setState({ ...payload, status: "ready", error: null });
      } catch (err) {
        // Keep showing stale data on a failed background refresh
        if (!cancelled && cached === undefined) {
          setState({ data: null, prevData: null, status: "error", error: friendlyError(err) });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [agency, quarter, retryKey]);

  return state;
}
