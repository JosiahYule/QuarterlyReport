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
export const getCached = (key) => reportCache.get(key);
export const setCached = (key, value) => reportCache.set(key, value);
