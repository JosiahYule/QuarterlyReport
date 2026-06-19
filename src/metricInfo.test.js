import { describe, it, expect } from "vitest";
import { METRIC_INFO } from "./metricInfo.js";

// Keys referenced by the Social and Website pages' tooltips. If a page starts
// using a new metric tip, add its key here so the guard keeps the copy honest.
const REQUIRED_KEYS = [
  // Website KPIs
  "sessions", "users", "engagementRate", "avgEngagementTime", "actions", "formSubmissions",
  // Website channels & pages
  "channel", "trafficShare", "pageViews", "bounceRate", "avgTimeOnPage",
  // Social KPIs
  "posts", "impressions", "shares", "reactions", "followers", "linkClicks", "comments",
  "engagementRateSocial",
  // Social platforms & posts
  "platform", "pageReach", "pageClicks", "engagements",
];

describe("METRIC_INFO", () => {
  it("defines every metric the report pages reference", () => {
    for (const key of REQUIRED_KEYS) {
      expect(METRIC_INFO, `missing definition for "${key}"`).toHaveProperty(key);
    }
  });

  it("uses non-empty, sentence-like plain-language copy", () => {
    for (const [key, def] of Object.entries(METRIC_INFO)) {
      expect(typeof def, `"${key}" should be a string`).toBe("string");
      expect(def.trim().length, `"${key}" should not be empty`).toBeGreaterThan(0);
      // A real explanation, not just a restated label
      expect(def.trim().length, `"${key}" reads too short to be plain-language`).toBeGreaterThan(20);
      expect(def.trim().endsWith("."), `"${key}" should end with a period`).toBe(true);
    }
  });
});
