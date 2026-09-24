import { useState, useEffect } from "react";

// Shared fetch resilience: retry with backoff for transient failures,
// human-readable error messages, and a session-lived report cache so
// switching agency/quarter/view serves the last good data instantly while
// revalidating in the background (stale-while-revalidate).

function isTransient(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const msg = String(err?.message || "");
  if (/failed to fetch|networkerror|load failed|timeout|timed out|aborted/i.test(msg)) return true;
  const status = err?.status ?? err?.code;
  return typeof status === "number" && status >= 500;
}

export async function withRetry(fn, { retries = 2, baseDelay = 600 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** attempt));
    }
  }
  throw lastErr;
}

export function friendlyError(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }
  const msg = String(err?.message || "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Couldn't reach the data service. Check your connection and try again.";
  }
  if (err?.status === 401 || err?.status === 403 || err?.code === "PGRST301") {
    return "This data couldn't be accessed. Reload the page and try again.";
  }
  return "Something went wrong loading this report. Try again in a moment.";
}

const reportCache = new Map();

// Stale-while-revalidate over the session cache: serve the last good copy of
// `key` at once, refetch in the background, and surface an error only when
// there was nothing to show. A failed background refresh keeps the stale copy.
//
// `key` must name everything `load` depends on (e.g. "social:isl:q4-2025-26"),
// because a new key is what triggers a refetch; `load` itself is not watched.
export function useCachedResource(key, load, retryKey = 0) {
  const [state, setState] = useState({ data: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;
    const cached = reportCache.get(key);
    setState(
      cached !== undefined
        ? { data: cached, status: "ready", error: null }
        : { data: null, status: "loading", error: null }
    );

    load().then(
      (data) => {
        reportCache.set(key, data);
        if (!cancelled) setState({ data, status: "ready", error: null });
      },
      (err) => {
        if (!cancelled && cached === undefined)
          setState({ data: null, status: "error", error: friendlyError(err) });
      }
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the `key` contract above
  }, [key, retryKey]);

  return state;
}

// The row a one-per-report child table holds for its report (KPIs, insights),
// or null. Supabase sends an embedded child table as a list, unless the
// child's report_id is unique, in which case it sends the single row on its
// own. Adding that unique rule is enough to flip the shape, which is how
// every Website KPI went blank when web_kpis gained UNIQUE (report_id) for
// the transactional save. Reading through this accepts either shape.
export function oneRow(embed) {
  return (Array.isArray(embed) ? embed[0] : embed) ?? null;
}
