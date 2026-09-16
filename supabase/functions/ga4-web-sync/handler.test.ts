import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHandler } from "./handler.ts";

let serviceAccount: string;
let settings: Record<string, string>;
let writes: { url: string; body: Record<string, any> }[];
let fetchMock: ReturnType<typeof vi.fn>;
let pages: Record<string, unknown>;
let failingProperty: string | null;
const row = (metrics: (string | number)[], dimension?: string) => ({
  metricValues: metrics.map((v) => ({ value: String(v) })),
  dimensionValues: dimension === undefined ? [] : [{ value: dimension }],
});
const request = (body: unknown, authorization = "Bearer test-service-key") =>
  new Request("https://example.test/functions/v1/ga4-web-sync", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const invoke = (body: unknown) => createHandler((name) => settings[name])(request(body));

beforeAll(async () => {
  // Generate an ephemeral key to exercise the real Google JWT signing path.
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  serviceAccount = JSON.stringify({
    client_email: "test@example.test",
    private_key: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString("base64")}\n-----END PRIVATE KEY-----`,
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T15:00:00Z"));
  settings = {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    GA4_SERVICE_ACCOUNT_JSON: serviceAccount,
    GA4_PROPERTY_ISL: "123",
    GA4_PROPERTY_AS: "456",
  };
  writes = [];
  pages = { rows: [row([100, 0.2, 2400, 40], "/")] };
  failingProperty = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "fake-google-token" });
    const body = JSON.parse(init.body as string);
    if (url.includes("analyticsdata.googleapis.com")) {
      if (failingProperty && url.includes(`/properties/${failingProperty}:`))
        return new Response("permission denied", { status: 403 });
      const dimension = body.dimensions?.[0].name;
      if (dimension === "pagePath") return Response.json(pages);
      if (dimension === "sessionDefaultChannelGroup")
        return Response.json({ rows: [row([100, 0.6], "Direct")] });
      return Response.json({ rows: [row([100, 80, 0.6, 6000])] });
    }
    writes.push({ url, body });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GA4 handler", () => {
  it("refuses an anon JWT before accessing Google or writing with service_role", async () => {
    const response = await createHandler((name) => settings[name])(request({}, "Bearer public-anon-jwt"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects GET instead of starting a write", async () => {
    const response = await createHandler((name) => settings[name])(
      new Request("https://example.test", { headers: { authorization: "Bearer test-service-key" } })
    );
    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { dry_run: "true" },
    { dryRun: true },
    { agencies: [] },
    { agencies: ["typo"] },
    { quarter: "q4" },
    null,
  ])("rejects an unsafe invocation %j before any calls", async (body) => {
    expect((await invoke(body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON without falling back to a scheduled write", async () => {
    const response = await createHandler((name) => settings[name])(
      new Request("https://example.test", {
        method: "POST",
        headers: { authorization: "Bearer test-service-key" },
        body: "{bad-json",
      })
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("dry-runs the complete closed Q4 even after its close-out window, without any database writes", async () => {
    const response = await invoke({ dry_run: true, agencies: ["isl"], quarter: "q4", year: "2026" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.results[0]).toMatchObject({
      status: "dry_run",
      range: { startDate: "2026-06-01", endDate: "2026-08-31" },
    });
    expect(body.results[0].payload.kpis).toMatchObject({
      sessions: 100,
      users: 80,
      avg_engagement_time_sec: 60,
    });
    expect(writes).toEqual([]);
    for (const [url, init] of fetchMock.mock.calls) {
      if (url.includes("analyticsdata.googleapis.com"))
        expect(JSON.parse(init.body as string).dateRanges).toEqual([
          { startDate: "2026-06-01", endDate: "2026-08-31" },
        ]);
    }
  });
  it("preserves stored pages and editorial fields when the page report is empty", async () => {
    pages = {};
    expect((await invoke({ agencies: ["isl"] })).status).toBe(200);
    const save = writes.find((w) => w.url.endsWith("save_web_report"))!;
    expect(save.body.payload).not.toHaveProperty("pages");
    expect(save.body.payload).not.toHaveProperty("summary_bullet");
    expect(save.body.payload).not.toHaveProperty("insights");
    expect(save.body.payload.kpis).not.toHaveProperty("form_submissions");
    expect(writes.find((w) => w.url.endsWith("ingestion_runs"))?.body.message).toContain(
      "pages left untouched"
    );
  });
  it("makes no report write if even one GA4 request fails", async () => {
    failingProperty = "123";
    expect((await invoke({ agencies: ["isl"] })).status).toBe(500);
    expect(writes.every((w) => w.url.endsWith("ingestion_runs"))).toBe(true);
    expect(writes[0].body.status).toBe("failed");
  });
  it("continues other brands but returns non-2xx if any property fails", async () => {
    failingProperty = "456";
    const response = await invoke({ agencies: ["isl", "as"] });
    expect(response.status).toBe(500);
    expect((await response.json()).results.map((r: any) => r.status)).toEqual(["success", "failed"]);
  });
  it("supports ADS when its property is configured", async () => {
    settings.GA4_PROPERTY_ADS = "789";
    expect((await invoke({ agencies: ["ads"] })).status).toBe(200);
    expect(writes.find((w) => w.url.endsWith("save_web_report"))?.body.payload.agency).toBe("ads");
  });
  it("reports a missing explicitly requested property instead of silently skipping it", async () => {
    const response = await invoke({ dry_run: true, agencies: ["isl", "ads"] });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("GA4_PROPERTY_ADS");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("explains a Measurement ID pasted where the Property ID is needed", async () => {
    settings.GA4_PROPERTY_ISL = "G-123ABC";
    const response = await invoke({ dry_run: true });
    expect((await response.json()).error).toContain("numeric GA4 Property ID");
  });
  it("reports malformed credentials without returning their contents", async () => {
    settings.GA4_SERVICE_ACCOUNT_JSON = "private-data-that-is-not-json";
    const response = await invoke({ dry_run: true });
    const body = await response.json();
    expect(body.error).toContain("complete JSON key file");
    expect(JSON.stringify(body)).not.toContain(settings.GA4_SERVICE_ACCOUNT_JSON);
    expect(writes).toEqual([]);
  });
  it("records bootstrap failures so the admin can show them", async () => {
    delete settings.GA4_SERVICE_ACCOUNT_JSON;
    expect((await invoke({})).status).toBe(500);
    expect(writes[0].body).toMatchObject({
      status: "failed",
      message: "GA4_SERVICE_ACCOUNT_JSON is not set",
    });
  });
  it("reports log-table HTTP errors instead of silently ignoring them", async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) =>
      url.endsWith("ingestion_runs") ? new Response("missing table", { status: 404 }) : original(url, init)
    );
    expect((await invoke({ agencies: ["isl"] })).status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      "ingestion_runs write failed:",
      expect.stringContaining("404")
    );
  });
});
