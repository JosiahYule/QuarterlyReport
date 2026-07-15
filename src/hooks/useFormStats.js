import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { QUARTERS } from "../config.js";
import { withRetry, getCached, setCached } from "../lib/fetching.js";

// The stats function and the form_submissions table work in Halifax
// wall-clock dates, so quarter bounds are sent as plain calendar dates.
const isoDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function fetchStats(agency, q) {
  const { data, error } = await supabase.rpc("form_submission_stats", {
    p_agency: agency,
    p_start:  isoDate(q.start),
    p_end:    isoDate(q.end),
  });
  if (error) throw error;
  return data;
}

// Aggregated contact-form submission stats for the selected and prior
// quarter. The section is optional — on failure it simply stays off the
// page, so there is no error state to surface.
export function useFormStats(agency, quarter) {
  const [state, setState] = useState({ stats: null, prevStats: null, status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const idx = QUARTERS.findIndex(q => q.suffix === quarter);
    const q = QUARTERS[idx];
    if (!q) {
      setState({ stats: null, prevStats: null, status: "ready" });
      return;
    }
    const prev = idx < QUARTERS.length - 1 ? QUARTERS[idx + 1] : null;
    const cacheKey = `forms:${agency}:${quarter}`;
    const cached = getCached(cacheKey);

    setState(cached !== undefined
      ? { ...cached, status: "ready" }
      : { stats: null, prevStats: null, status: "loading" });

    (async () => {
      try {
        const [stats, prevStats] = await Promise.all([
          withRetry(() => fetchStats(agency, q)),
          prev ? withRetry(() => fetchStats(agency, prev)) : Promise.resolve(null),
        ]);
        const payload = { stats, prevStats };
        setCached(cacheKey, payload);
        if (!cancelled) setState({ ...payload, status: "ready" });
      } catch {
        if (!cancelled && cached === undefined) {
          setState({ stats: null, prevStats: null, status: "error" });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [agency, quarter]);

  return state;
}
