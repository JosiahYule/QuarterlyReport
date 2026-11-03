import { describe, expect, it } from "vitest";
import { quarterFromKey } from "../config.js";
import {
  quarterCoverage,
  compareMetric,
  asOfLabel,
  MIN_PACE_FRACTION,
  TOTAL,
  LEVEL,
  UNIQUE,
} from "./quarterProgress.js";

// Q1 2026–27: 1 Sep to 30 Nov 2026, 91 days.
const q = quarterFromKey("q1", "2026");
const at = (fraction) => new Date(q.start.getTime() + fraction * (q.end - q.start));

describe("quarterCoverage", () => {
  it("calls a report saved after its quarter ended complete", () => {
    expect(quarterCoverage(q, new Date(2026, 11, 4))).toEqual({ complete: true, fraction: 1 });
  });

  it("measures a report saved mid-quarter by its save time, not today", () => {
    const c = quarterCoverage(q, at(0.5));
    expect(c.complete).toBe(false);
    expect(c.fraction).toBeCloseTo(0.5, 5);
    expect(c.days).toBe(91);
  });

  it("reads a database timestamp string", () => {
    const c = quarterCoverage(q, at(0.25).toISOString());
    expect(c.fraction).toBeCloseTo(0.25, 5);
  });

  it("treats a report saved before its quarter began as covering none of it", () => {
    expect(quarterCoverage(q, new Date(2026, 7, 20)).fraction).toBe(0);
  });

  it("falls back to complete with no usable save time, so old behaviour stands", () => {
    expect(quarterCoverage(q, null).complete).toBe(true);
    expect(quarterCoverage(q, "not a date").complete).toBe(true);
  });
});

describe("compareMetric", () => {
  const complete = { complete: true, fraction: 1 };
  const half = quarterCoverage(q, at(0.5));

  it("compares a finished quarter's figures as they stand", () => {
    const c = compareMetric(TOTAL, 80, 100, complete);
    expect(c).toEqual({ delta: { dir: "down", pct: 20 }, paced: false, projected: null });
  });

  it("compares a partial total at its pace instead of as a fall", () => {
    // 60 by halfway is on pace for 120: up 20%, where the raw figure read down 40%.
    const c = compareMetric(TOTAL, 60, 100, half);
    expect(c.paced).toBe(true);
    expect(c.projected).toBe(120);
    expect(c.delta.dir).toBe("up");
    expect(c.delta.pct).toBeCloseTo(20, 5);
  });

  it("rounds the projected figure but not the comparison", () => {
    const third = quarterCoverage(q, at(1 / 3));
    const c = compareMetric(TOTAL, 7, 20, third);
    // 7 by a third of the way is a pace of 21: shown as 21, compared as 21.0…
    expect(c.projected).toBe(21);
    expect(c.delta.pct).toBeCloseTo(5, 5);
  });

  it("compares a rate or a level as it stands, even mid-quarter", () => {
    const c = compareMetric(LEVEL, 5.5, 5, half);
    expect(c.paced).toBe(false);
    expect(c.delta.dir).toBe("up");
    expect(c.delta.pct).toBeCloseTo(10, 5);
  });

  it("offers no comparison for a partial count of distinct people", () => {
    expect(compareMetric(UNIQUE, 9000, 18000, half)).toEqual({ delta: null, paced: false, projected: null });
  });

  it("offers no paced comparison too early in the quarter to mean anything", () => {
    const early = quarterCoverage(q, at(MIN_PACE_FRACTION / 2));
    expect(compareMetric(TOTAL, 10, 100, early).delta).toBeNull();
  });

  it("has nothing to compare with when the previous quarter has no figure", () => {
    expect(compareMetric(TOTAL, 60, null, half).delta).toBeNull();
  });
});

describe("asOfLabel", () => {
  it("names the save date in the agencies' timezone", () => {
    // 02:00 UTC on 4 Nov is still 3 Nov in Halifax.
    expect(asOfLabel({ asOf: new Date("2026-11-04T02:00:00Z") })).toMatch(/Nov\.? 3/);
  });

  it("is empty for a complete quarter", () => {
    expect(asOfLabel({ complete: true })).toBe("");
  });
});
