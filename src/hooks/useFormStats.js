import { supabase } from "../lib/supabase.js";
import { resolveQuarter, previousQuarter } from "../config.js";
import { withRetry, useCachedResource } from "../lib/fetching.js";

// The stats function and the form_submissions table work in Halifax
// wall-clock dates, so quarter bounds are sent as plain calendar dates.
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function fetchStats(agency, q) {
  const { data, error } = await supabase.rpc("form_submission_stats", {
    p_agency: agency,
    p_start: isoDate(q.start),
    p_end: isoDate(q.end),
  });
  if (error) throw error;
  return data;
}

// Aggregated contact-form submission stats for the selected and prior
// quarter. The section is optional: on failure it simply stays off the page,
// so there is no error state to surface.
export function useFormStats(agency, quarter) {
  const q = resolveQuarter(quarter);
  const { data } = useCachedResource(`forms:${agency}:${q.id}`, async () => {
    const [stats, prevStats] = await Promise.all([
      withRetry(() => fetchStats(agency, q)),
      withRetry(() => fetchStats(agency, previousQuarter(q))),
    ]);
    return { stats, prevStats };
  });
  return { stats: data?.stats ?? null, prevStats: data?.prevStats ?? null };
}
