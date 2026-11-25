import { describe, it, expect } from "vitest";
import { normalizeCampaigns, campaignSpans, campaignDateRange } from "./paidCampaigns.js";

// ISL's two real campaigns, as stored: one dated, one entered without dates.
const JULY = {
  name: "July 2026 - Brand Awareness Campaign ",
  platform: "LinkedIn",
  budget: "500",
  start_date: "2026-07-02",
  end_date: "2026-07-23",
};
const UNDATED = {
  name: "Perm Lead Gen - National - Oct 2026",
  platform: "LinkedIn",
  budget: "500",
  start_date: null,
  end_date: null,
};

describe("normalizeCampaigns", () => {
  it("reads stored dates as local days, with an exclusive end the day after the last", () => {
    const [c] = normalizeCampaigns([JULY]);
    expect(c.start).toEqual(new Date(2026, 6, 2));
    expect(c.end).toEqual(new Date(2026, 6, 24));
    expect(c.undated).toBe(false);
  });

  it("does not shift a bare date to the previous evening the way new Date('2026-07-02') would", () => {
    const [c] = normalizeCampaigns([JULY]);
    expect(c.start.getDate()).toBe(2);
    expect(c.start.getHours()).toBe(0);
  });

  it("tidies the name and parses the budget", () => {
    const [c] = normalizeCampaigns([JULY]);
    expect(c.name).toBe("July 2026 - Brand Awareness Campaign");
    expect(c.budget).toBe(500);
    expect(normalizeCampaigns([{ ...JULY, budget: "$1,250" }])[0].budget).toBe(1250);
  });

  it("flags a campaign with no start date as undated instead of inventing dates", () => {
    const [c] = normalizeCampaigns([UNDATED]);
    expect(c.undated).toBe(true);
    expect(c.start).toBeNull();
    expect(c.end).toBeNull();
  });

  it("treats a start with no end, or an end before the start, as a single day", () => {
    const [noEnd] = normalizeCampaigns([{ ...JULY, end_date: null }]);
    expect(noEnd.end).toEqual(new Date(2026, 6, 3));
    const [backwards] = normalizeCampaigns([{ ...JULY, end_date: "2026-06-01" }]);
    expect(backwards.end).toEqual(new Date(2026, 6, 3));
  });

  it("survives missing or malformed input", () => {
    expect(normalizeCampaigns(null)).toEqual([]);
    expect(normalizeCampaigns([null, "x"])).toEqual([]);
    const [c] = normalizeCampaigns([{ start_date: "July 2nd" }]);
    expect(c.undated).toBe(true);
    expect(c.name).toBe("Untitled campaign");
    expect(c.budget).toBeNull();
  });
});

describe("campaignSpans", () => {
  const campaigns = normalizeCampaigns([JULY, UNDATED]);
  const t = (y, m, d) => new Date(y, m, d).getTime();

  it("returns dated campaigns overlapping the window, leaving undated ones out", () => {
    const spans = campaignSpans(campaigns, t(2026, 5, 1), t(2026, 8, 1));
    expect(spans).toHaveLength(1);
    expect(spans[0].from).toBe(t(2026, 6, 2));
    expect(spans[0].to).toBe(t(2026, 6, 24));
  });

  it("clips a campaign to the window it overlaps", () => {
    const spans = campaignSpans(campaigns, t(2026, 6, 10), t(2026, 6, 15));
    expect(spans[0].from).toBe(t(2026, 6, 10));
    expect(spans[0].to).toBe(t(2026, 6, 15));
  });

  it("returns nothing for a window the campaign does not touch, or an empty window", () => {
    expect(campaignSpans(campaigns, t(2026, 8, 1), t(2026, 11, 1))).toEqual([]);
    expect(campaignSpans(campaigns, t(2026, 6, 10), t(2026, 6, 10))).toEqual([]);
    expect(campaignSpans(null, t(2026, 5, 1), t(2026, 8, 1))).toEqual([]);
  });
});

describe("campaignDateRange", () => {
  it("prints the inclusive range as entered", () => {
    const [c] = normalizeCampaigns([JULY]);
    expect(campaignDateRange(c)).toBe("Jul 2 – Jul 23");
  });

  it("prints a single day once, and nothing for an undated campaign", () => {
    const [one] = normalizeCampaigns([{ ...JULY, end_date: "2026-07-02" }]);
    expect(campaignDateRange(one)).toBe("Jul 2");
    expect(campaignDateRange(normalizeCampaigns([UNDATED])[0])).toBeNull();
  });
});
