// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useWebReport } from "./useWebReport.js";
import { supabase } from "../lib/supabase.js";
import { QUARTERS } from "../config.js";

vi.mock("../lib/supabase.js", () => ({ supabase: { from: vi.fn() } }));

const KPIS = {
  sessions: 27945,
  users: 17875,
  engagement_rate: 50.53,
  avg_engagement_time_sec: 87,
  actions: 99,
  form_submissions: 511,
};
const INSIGHTS = { working: "Search led.", not_working: "", actions: "", next_quarter: "" };

// Supabase sends a child table that is unique on report_id as a single
// object, and any other as a list. web_kpis and web_insights switched to the
// object shape when they gained that unique rule, and the page, still reading
// them as lists, showed a dash for every KPI.
function stubReport(shape) {
  const report = {
    id: "r4",
    summary_bullet: "",
    web_kpis: shape === "object" ? KPIS : [KPIS],
    web_insights: shape === "object" ? INSIGHTS : [INSIGHTS],
    web_channels: [],
    web_pages: [],
  };
  supabase.from.mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: report, error: null }),
    };
    return chain;
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useWebReport reading one-per-report sections", () => {
  // Each case uses its own agency so the session cache can't answer for it.
  for (const [shape, agency] of [
    ["object", "as"],
    ["list", "ads"],
  ]) {
    it(`reads the KPIs and insights when they arrive as a${shape === "object" ? "n object" : " list"}`, async () => {
      stubReport(shape);
      const { result } = renderHook(() => useWebReport(agency, QUARTERS[1].id));
      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(result.current.data.overall).toMatchObject({
        sessions: 27945,
        users: 17875,
        engagementRate: 50.53,
        avgEngagementTimeSec: 87,
        actions: 99,
        formSubmissions: 511,
      });
      expect(result.current.data.insights.working).toBe("Search led.");
    });
  }
});
