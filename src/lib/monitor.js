// Production error reporting. Errors always go to the console; set
// VITE_ERROR_WEBHOOK_URL to also forward them as JSON to a collector
// (a Slack webhook, a Supabase edge function, Sentry's store endpoint, …).
const endpoint = import.meta.env.VITE_ERROR_WEBHOOK_URL;

export function reportError(error, context = {}) {
  console.error("[app error]", error, context);
  if (!endpoint || !import.meta.env.PROD) return;
  try {
    const body = JSON.stringify({
      message: String(error?.message ?? error),
      stack: error?.stack ?? null,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ts: new Date().toISOString(),
    });
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
      fetch(endpoint, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    // Reporting must never throw
  }
}

let installed = false;
export function installGlobalErrorReporting() {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) =>
    reportError(e.error ?? e.message, { source: "window.onerror" }));
  window.addEventListener("unhandledrejection", (e) =>
    reportError(e.reason, { source: "unhandledrejection" }));
}
