import { describe, it, expect } from "vitest";
import {
  computeAdvancedPace,
  clampCalibrationFactor,
  getMetricHistory,
  extractMetric,
  METRICS,
} from "./useTrendsData.js";

const DAY = 86400000;
const qStart = new Date(2026, 2, 1); // Mar 1
const qEnd   = new Date(2026, 5, 1); // Jun 1 (exclusive)

describe("computeAdvancedPace", () => {
  it("returns null with no usable current value", () => {
    expect(computeAdvancedPace(null, qStart, qEnd, null, [], 0)).toBeNull();
    expect(computeAdvancedPace(NaN, qStart, qEnd, null, [], 0)).toBeNull();
  });

  it("returns null in the first week of the quarter", () => {
    const asOf = new Date(qStart.getTime() + 3 * DAY);
    expect(computeAdvancedPace(100, qStart, qEnd, null, [], 0, asOf)).toBeNull();
  });

  it("projects via simple daily rate when there is no snapshot history", () => {
    const asOf = new Date(qStart.getTime() + 46 * DAY); // mid-quarter
    const pace = computeAdvancedPace(460, qStart, qEnd, null, [], 0, asOf);
    expect(pace).not.toBeNull();
    // 10/day over a 92-day quarter ≈ 920
    expect(pace.projected).toBeGreaterThan(900);
    expect(pace.projected).toBeLessThan(940);
    expect(pace.dailyRate).toBeCloseTo(10, 5);
  });

  it("never projects below the current actual", () => {
    const asOf = new Date(qStart.getTime() + 80 * DAY);
    const pace = computeAdvancedPace(5000, qStart, qEnd, null, [], 0, asOf);
    expect(pace.projected).toBeGreaterThanOrEqual(5000);
  });

  it("applies the calibration factor, clamped to sane bounds", () => {
    const asOf = new Date(qStart.getTime() + 46 * DAY);
    const base = computeAdvancedPace(460, qStart, qEnd, null, [], 0, asOf, 1);
    const up   = computeAdvancedPace(460, qStart, qEnd, null, [], 0, asOf, 1.2);
    expect(up.projected).toBeCloseTo(base.projected * 1.2, 5);
    const bogus = computeAdvancedPace(460, qStart, qEnd, null, [], 0, asOf, -5);
    expect(bogus.projected).toBeCloseTo(base.projected, 5);
  });

  it("blends toward the Q2 rate early in the quarter", () => {
    const asOf = new Date(qStart.getTime() + 8 * DAY); // ~9% elapsed
    const withAnchor = computeAdvancedPace(80, qStart, qEnd, 50, [], 0, asOf); // Q2 ran at 50/day
    const noAnchor   = computeAdvancedPace(80, qStart, qEnd, null, [], 0, asOf);
    expect(withAnchor.projected).toBeGreaterThan(noAnchor.projected);
  });
});

describe("clampCalibrationFactor", () => {
  it("clamps to [0.5, 1.5] and defaults bad input to 1", () => {
    expect(clampCalibrationFactor(0.2)).toBe(0.5);
    expect(clampCalibrationFactor(3)).toBe(1.5);
    expect(clampCalibrationFactor(1.1)).toBe(1.1);
    expect(clampCalibrationFactor(NaN)).toBe(1);
    expect(clampCalibrationFactor(-1)).toBe(1);
  });
});

describe("getMetricHistory", () => {
  it("filters to the metric and sorts by time", () => {
    const snaps = [
      { t: 300, vals: { impressions: 30 } },
      { t: 100, vals: { impressions: 10 } },
      { t: 200, vals: { reactions: 5 } },
    ];
    expect(getMetricHistory(snaps, "impressions")).toEqual([
      { t: 100, val: 10 },
      { t: 300, val: 30 },
    ]);
  });
  it("handles missing input", () => {
    expect(getMetricHistory(null, "impressions")).toEqual([]);
  });
});

describe("extractMetric", () => {
  const impressions = METRICS.find((m) => m.id === "impressions");

  it("reads from normalized overall data", () => {
    expect(extractMetric({ overall: { impressions: 1234 } }, impressions)).toBe(1234);
  });
  it("reads from quarterTotals rows by fuzzy field name", () => {
    const data = { quarterTotals: [{ field: "Post Impressions", value: "2,500" }] };
    expect(extractMetric(data, impressions)).toBe(2500);
  });
  it("returns null when absent", () => {
    expect(extractMetric(null, impressions)).toBeNull();
    expect(extractMetric({ overall: {} }, impressions)).toBeNull();
  });
});
