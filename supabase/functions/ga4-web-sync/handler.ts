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
  requestedQuarter,
  todayInReportTZ,
  type Ga4Report,
  type Quarter,
} from "./mapping.ts";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

export function createHandler(env: (name: string) => string | undefined) {
  const SUPABASE_URL = env("SUPABASE_URL") ?? "";
  const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  async function logRun(row: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ingestion_runs`, {
        method: "POST",
        headers: { ...dbHeaders(), prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(`ingestion_runs write failed (${res.status}): ${await res.text()}`);
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

    const payload = buildPayload(agency, quarter, kpis, channels, pages.length ? pages : null);

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
  return async (req: Request): Promise<Response> => {
    // Gateway JWT verification also accepts the public anon JWT. This job
    // writes with service_role, so only the service-role credential may invoke it.
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json(
        { ok: false, error: "Supabase server credentials are not configured" },
        { status: 500 }
      );
    }
    if (req.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) {
      return Response.json(
        { ok: false, error: "Use the legacy service_role key to invoke this server-only sync" },
        { status: 401 }
      );
    }
    if (req.method !== "POST") {
      return Response.json(
        { ok: false, error: "Use POST with a JSON object" },
        { status: 405, headers: { Allow: "POST" } }
      );
    }
    const startedAt = new Date().toISOString();
    let dryRun = false;
    let only: string[] | null = null;
    let body: Record<string, unknown>;
    let periods: ReturnType<typeof quartersToSync>;

    // Reject malformed requests before touching Google or the database. A typo
    // in dry_run must never turn a preview into a live write.
    try {
      body = await req.json();
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("Body must be a JSON object");
      const allowed = ["dry_run", "agencies", "quarter", "year"];
      if (Object.keys(body).some((key) => !allowed.includes(key)))
        throw new Error(`Accepted fields: ${allowed.join(", ")}`);
      if ("dry_run" in body && typeof body.dry_run !== "boolean")
        throw new Error("dry_run must be true or false (not a string)");
      dryRun = body.dry_run === true;
      if ("agencies" in body) {
        if (
          !Array.isArray(body.agencies) ||
          !body.agencies.length ||
          body.agencies.some((a) => typeof a !== "string" || !Object.hasOwn(BRANDS, a))
        ) {
          throw new Error("agencies must be a non-empty array containing isl, as, or ads");
        }
        only = [...new Set(body.agencies as string[])];
      }
      const today = todayInReportTZ();
      periods =
        "quarter" in body || "year" in body
          ? [requestedQuarter(today, body.quarter, body.year)]
          : quartersToSync(today);
    } catch (err) {
      return Response.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 400 }
      );
    }

    try {
      const rawCreds = env("GA4_SERVICE_ACCOUNT_JSON");
      if (!rawCreds) throw new Error("GA4_SERVICE_ACCOUNT_JSON is not set");
      let creds;
      try {
        creds = JSON.parse(rawCreds);
      } catch {
        throw new Error(
          "GA4_SERVICE_ACCOUNT_JSON must contain the complete JSON key file, not a filename or just the private key"
        );
      }
      if (typeof creds?.client_email !== "string" || typeof creds?.private_key !== "string") {
        throw new Error("GA4_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
      }

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
        .map(([agency, cfg]) => {
          const propertyId = env(cfg.env)?.trim();
          if (only && !propertyId) throw new Error(`${cfg.env} is not set for requested agency ${agency}`);
          if (propertyId && !/^[0-9]+$/.test(propertyId))
            throw new Error(
              `${cfg.env} must be the numeric GA4 Property ID, not a G- measurement ID or properties/ path`
            );
          return { agency, cfg, propertyId };
        })
        .filter((t) => {
          if (!t.propertyId) console.warn(`${t.agency}: ${t.cfg.env} not set, skipping`);
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
            results.push({
              agency: t.agency,
              quarter: `${quarter.suffix} ${quarter.year}`,
              status: "failed",
              message,
            });
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
        { status: failed > 0 ? 500 : 200 }
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
  };
}
