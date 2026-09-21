// Quarter-to-date website figures from the GA4 Data API into web_reports.
//
// Runs weekly (see 20260915000003_schedule_ga4_web_sync.sql). Works out the
// current fiscal quarter from today's date in Halifax, asks GA4 for that
// quarter's figures up to yesterday, and writes them through save_web_report().
//
// It writes only what GA4 supplies. The summary, the four insight blocks,
// `actions` and `form_submissions` are never mentioned in the payload, and
// save_web_report() leaves absent keys alone, so hand-entered values survive
// every run. The field-by-field reasoning lives in mapping.ts.
//
// Invoke with {"dry_run": true} to fetch and compute without writing anything,
// which is how the numbers get checked against the GA4 UI before the schedule
// is switched on. {"agencies": ["isl"]} limits a run to one property.
//
// Invoke with {"install_token": "...", "credential": {...}} once to store the
// Google service-account JSON in Vault. See
// 20260915000004_ga4_credentials_in_vault.sql for why the credential can live
// there, and why an Edge Function secret still wins when one is set.

// Supabase's edge-runtime types, for Deno.serve and Deno.env. Only index.ts
// pulls these in; mapping.ts stays free of Deno so Vitest can import it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  BRANDS,
  CHANNEL_DIMENSION,
  CHANNEL_METRICS,
  KPI_METRICS,
  PAGE_DIMENSION,
  PAGE_METRICS,
  buildChannels,
  buildKpis,
  buildPages,
  buildPayload,
  isoDate,
  quartersToSync,
  resolvePropertyId,
  todayInReportTZ,
  type Ga4Report,
  type Quarter,
} from "./mapping.ts";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ─── Google service-account auth ──────────────────────────────────
function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// A service account authenticates by signing a JWT with its private key and
// trading it for a short-lived access token. Nothing is stored between runs.
async function getAccessToken(creds: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64url(
      JSON.stringify({
        iss: creds.client_email,
        scope: GA4_SCOPE,
        aud: TOKEN_URL,
        exp: now + 3600,
        iat: now,
      })
    );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(creds.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  if (!body.access_token) throw new Error("Google token exchange returned no access_token");
  return body.access_token as string;
}

// ─── GA4 Data API ─────────────────────────────────────────────────
async function runReport(
  token: string,
  propertyId: string,
  body: Record<string, unknown>
): Promise<Ga4Report> {
  const res = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // A 403 here is nearly always the service account missing Viewer access on
    // this property, not a malformed request.
    throw new Error(`GA4 runReport on property ${propertyId} failed (${res.status}): ${await res.text()}`);
  }
  return await res.json();
}

// ─── Supabase writes ──────────────────────────────────────────────
const dbHeaders = () => ({
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
});

async function saveWebReport(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_web_report`, {
    method: "POST",
    headers: dbHeaders(),
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error(`save_web_report failed (${res.status}): ${await res.text()}`);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: dbHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

// ─── Credentials and settings ─────────────────────────────────────
// Environment first, database second, for both the credential and the
// property IDs. A function secret is the better home for a private key, so it
// always wins; the Vault fallback exists because setting one needs dashboard
// access to this project, which is currently lost. Restoring that access and
// setting GA4_SERVICE_ACCOUNT_JSON retires this path with no code change.
type Credentials = { client_email: string; private_key: string };

async function loadCredentials(): Promise<Credentials> {
  const raw =
    Deno.env.get("GA4_SERVICE_ACCOUNT_JSON") ??
    (await rpc<string | null>("integration_secret_get", { p_name: "ga4_service_account" }));

  if (!raw) {
    throw new Error(
      "no GA4 credential: set the GA4_SERVICE_ACCOUNT_JSON function secret, or install one by posting an install_token and credential"
    );
  }
  let creds: Credentials;
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("stored GA4 credential is not valid JSON");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error("stored GA4 credential is missing client_email or private_key");
  }
  return creds;
}

async function loadConfig(): Promise<Record<string, string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/integration_config?select=key,value`, {
    headers: dbHeaders(),
  });
  if (!res.ok) return {};
  const rows = (await res.json()) as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function logRun(row: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ingestion_runs`, {
      method: "POST",
      headers: { ...dbHeaders(), prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch (err) {
    // The log failing must never take the run down with it.
    console.error("ingestion_runs write failed:", err instanceof Error ? err.message : err);
  }
}

// ─── One brand ────────────────────────────────────────────────────
async function syncBrand(
  agency: string,
  propertyId: string,
  labels: Record<string, string>,
  quarter: Quarter,
  endDate: Date,
  token: string,
  dryRun: boolean
) {
  const startedAt = new Date().toISOString();
  const range = { startDate: isoDate(quarter.start), endDate: isoDate(endDate) };
  const base = { dateRanges: [range], keepEmptyRows: false };
  const log = (status: string, message: string, rows = 0) =>
    logRun({
      source: "ga4",
      agency,
      quarter: quarter.suffix,
      year: quarter.year,
      status,
      rows_written: rows,
      message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

  // Everything is fetched before anything is written, so a failure on the
  // third call cannot leave the first two half-applied.
  const [kpiReport, channelReport, pageReport] = await Promise.all([
    runReport(token, propertyId, { ...base, metrics: KPI_METRICS.map((name) => ({ name })) }),
    runReport(token, propertyId, {
      ...base,
      dimensions: [{ name: CHANNEL_DIMENSION }],
      metrics: CHANNEL_METRICS.map((name) => ({ name })),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 25,
    }),
    runReport(token, propertyId, {
      ...base,
      dimensions: [{ name: PAGE_DIMENSION }],
      metrics: PAGE_METRICS.map((name) => ({ name })),
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 250,
    }),
  ]);

  const kpis = buildKpis(kpiReport);
  const channels = buildChannels(channelReport);

  // No usable KPI or channel data means GA4 returned nothing for this property
  // and range. Writing that would replace real figures with nothing, so the
  // run stops here and says so rather than writing zeroes.
  if (!kpis || !channels) {
    const message = !kpis
      ? "GA4 returned no session data for this property and date range"
      : "GA4 returned no channel rows for this property and date range";
    if (!dryRun) await log("skipped", message);
    return { agency, quarter: `${quarter.suffix} ${quarter.year}`, status: "skipped", message, range };
  }

  // Pages are a different case. GA4 answering fine but nothing matching the
  // label map is a configuration problem, not a data problem, so the key is
  // omitted and the stored pages stay exactly as they are. A wrong map costs a
  // warning, not a wiped Top Pages section.
  const rawPageRows = (pageReport.rows ?? []).length;
  const pages = buildPages(pageReport, labels);
  const pagesUnmatched = rawPageRows > 0 && pages.length === 0;

  const notes: string[] = [];
  if (pagesUnmatched) {
    notes.push(
      `${rawPageRows} GA4 page paths matched none of the ${Object.keys(labels).length} configured labels; pages left untouched`
    );
  } else if (rawPageRows === 0) {
    notes.push("GA4 returned no page rows; pages left untouched");
  }

  const payload = buildPayload(agency, quarter, kpis, channels, pagesUnmatched ? null : pages);

  if (dryRun) {
    return {
      agency,
      quarter: `${quarter.suffix} ${quarter.year}`,
      status: "dry_run",
      range,
      payload,
      notes,
      raw: { kpis: kpiReport, channels: channelReport, pages: pageReport },
    };
  }

  try {
    await saveWebReport(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log("failed", message);
    return { agency, quarter: `${quarter.suffix} ${quarter.year}`, status: "failed", message, range };
  }

  const written = 1 + channels.length + (payload.pages ? pages.length : 0);
  const message = [`${range.startDate} to ${range.endDate}`, ...notes].join("; ");
  await log("success", message, written);
  return {
    agency,
    quarter: `${quarter.suffix} ${quarter.year}`,
    status: "success",
    message,
    range,
    kpis,
    channels: channels.length,
    pages: payload.pages ? pages.length : 0,
  };
}

// ─── Handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();
  let dryRun = false;
  let only: string[] | null = null;

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
      dryRun = body?.dry_run === true;
      if (Array.isArray(body?.agencies) && (body.agencies as string[]).length) {
        only = body.agencies as string[];
      }
    }

    // One-time credential install. The token is checked and spent inside the
    // database, in the same transaction as the write, so this handler cannot
    // be talked into accepting a spent one. Nothing about the key is logged or
    // returned except the client_email, which is what lets the installer see
    // that the right file landed.
    if (body.install_token) {
      const credential =
        typeof body.credential === "string" ? body.credential : JSON.stringify(body.credential ?? null);
      const email = await rpc<string>("ga4_install_credential", {
        p_token: body.install_token,
        p_credential: credential,
      });
      return Response.json(
        { ok: true, installed: true, client_email: email, next: "re-run with dry_run set to true" },
        { status: 200 }
      );
    }

    const creds = await loadCredentials();
    const config = await loadConfig();

    const today = todayInReportTZ();
    // Normally just the current quarter, up to yesterday. For two weeks after a
    // rollover this also carries the quarter that just closed, so its final
    // days are not lost when the job moves on. See quartersToSync().
    const periods = quartersToSync(today);
    if (!periods.length) {
      const message = "no complete day in the current quarter yet";
      if (!dryRun) {
        await logRun({
          source: "ga4",
          status: "skipped",
          message,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        });
      }
      return Response.json({ ok: true, skipped: true, message }, { status: 200 });
    }

    const targets = Object.entries(BRANDS)
      .filter(([agency]) => !only || only.includes(agency))
      .map(([agency, cfg]) => ({
        agency,
        cfg,
        propertyId: resolvePropertyId(cfg, Deno.env.toObject(), config),
      }))
      .filter((t) => {
        if (!t.propertyId) {
          console.warn(
            `${t.agency}: no property id in ${t.cfg.env} or integration_config.${t.cfg.configKey}, skipping`
          );
        }
        return Boolean(t.propertyId);
      });

    if (!targets.length) throw new Error("no GA4 property IDs configured");

    const token = await getAccessToken(creds);

    // Brands are independent. One property being misconfigured should not
    // withhold another's data, so each is attempted and reported separately.
    const results = [];
    for (const { quarter, endDate } of periods) {
      for (const t of targets) {
        try {
          results.push(
            await syncBrand(t.agency, t.propertyId!, t.cfg.pageLabels, quarter, endDate, token, dryRun)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`${t.agency} ${quarter.suffix} ${quarter.year}: ${message}`);
          if (!dryRun) {
            await logRun({
              source: "ga4",
              agency: t.agency,
              quarter: quarter.suffix,
              year: quarter.year,
              status: "failed",
              message,
              started_at: startedAt,
              finished_at: new Date().toISOString(),
            });
          }
          results.push({ agency: t.agency, quarter: `${quarter.suffix} ${quarter.year}`, status: "failed", message });
        }
      }
    }

    const failed = results.filter((r) => r.status === "failed").length;
    return Response.json(
      {
        ok: failed === 0,
        dry_run: dryRun,
        quarters: periods.map((p) => `${p.quarter.suffix} ${p.quarter.year}`),
        results,
      },
      { status: failed === results.length ? 500 : 200 }
    );
  } catch (err) {
    // Nothing was written: the credential or the configuration failed before
    // any brand was attempted.
    const message = err instanceof Error ? err.message : String(err);
    console.error("ga4-web-sync:", message);
    if (!dryRun) {
      await logRun({
        source: "ga4",
        status: "failed",
        message,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });
    }
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
