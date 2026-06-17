import { describe, it, expect } from "vitest";
import {
  computeAdvancedPace,
  buildProjectionAudit,
} from "./projection.js";

const DAY = 86400000;
const qStart = new Date(2026, 2, 1); // Mar 1
const qEnd = new Date(2026, 5, 1);   // Jun 1 (exclusive), 92-day quarter

// Decelerating cumulative series: increments shrink from 40/day toward ~4/day.
// Early daily-rate extrapolation over-projects; late projections are accurate.
function decelSnapshots() {
  const snaps = [];
  let acc = 0;
  for (let i = 0; i < 92; i++) {
    acc += Math.max(0, 40 - 0.4 * i);
    snaps.push({ t: qStart.getTime() + i * DAY, vals: { m: acc } });
  }
  return snaps;
}
const metric = { id: "m", label: "m", isPace: true };

describe("computeAdvancedPace — continuous blending", () => {
  // Build a fixed decelerating history up to day 50, then evaluate the
  // projection just below and just above the old 0.55 weight threshold.
  const snaps = decelSnapshots().slice(0, 51).map(s => ({ t: s.t, val: s.vals.m }));
  const current = snaps[snaps.length - 1].val;

  it("has no discontinuity crossing the old 0.55 blend threshold", () => {
    const below = computeAdvancedPace(current, qStart, qEnd, null, snaps, 0, new Date(qStart.getTime() + 50.5 * DAY));
    const above = computeAdvancedPace(current, qStart, qEnd, null, snaps, 0, new Date(qStart.getTime() + 50.7 * DAY));
    expect(below).not.toBeNull();
    expect(above).not.toBeNull();
    // A 0.2-day nudge should move the projection by well under 0.5%.
    const jump = Math.abs(above.projected - below.projected) / below.projected;
    expect(jump).toBeLessThan(0.005);
  });

  it("recovers the exact rate on a perfectly linear series", () => {
    const linear = [];
    for (let i = 0; i <= 40; i++) linear.push({ t: qStart.getTime() + i * DAY, val: 10 * i });
    const pace = computeAdvancedPace(400, qStart, qEnd, null, linear, 0, new Date(qStart.getTime() + 40 * DAY));
    expect(pace.dailyRate).toBeCloseTo(10, 6);
    expect(pace.projected).toBeCloseTo(920, 0); // 10/day × 92 days
  });
});

describe("computeAdvancedPace — least-squares rolling rate", () => {
  it("is robust to a single noisy final snapshot", () => {
    // Seven days of clean slope-10 growth, then a spurious high final point.
    const base = [];
    for (let i = 44; i <= 51; i++) base.push({ t: qStart.getTime() + i * DAY, val: 10 * i });
    const noisy = base.map((s, idx) => idx === base.length - 1 ? { ...s, val: s.val + 60 } : s);
    const current = noisy[noisy.length - 1].val;

    const first = noisy[0], last = noisy[noisy.length - 1];
    const endpointSlope = (last.val - first.val) / ((last.t - first.t) / DAY);

    const pace = computeAdvancedPace(current, qStart, qEnd, null, noisy, 0, new Date(last.t));
    expect(pace.dailyRate).toBeGreaterThan(0);
    // Least-squares should not chase the inflated endpoint the way a
    // first-vs-last difference would.
    expect(pace.dailyRate).toBeLessThan(endpointSlope);
  });
});

describe("buildProjectionAudit — stage-weighted calibration", () => {
  const snapshotHistory = decelSnapshots();
  const actual = snapshotHistory[snapshotHistory.length - 1].vals.m;
  const common = {
    metric,
    actualValue: actual,
    completedQuarter: { start: qStart, end: qEnd },
    previousQuarter: { start: new Date(2025, 11, 1), end: qStart },
    previousQuarterValue: 1800,
    twoBackValue: null,
    snapshotHistory,
  };

  it("does not throw when the prior quarter has snapshots in its first week", () => {
    // Regression guard: a <7-day sample makes computeAdvancedPace return
    // null; the audit must skip it instead of dereferencing null.
    expect(() => buildProjectionAudit({ ...common, targetElapsedFraction: 0.8 })).not.toThrow();
  });

  it("tracks late-stage accuracy better than the equal-weight mean", () => {
    const equal = buildProjectionAudit({ ...common, targetElapsedFraction: null });
    const lateStage = buildProjectionAudit({ ...common, targetElapsedFraction: 0.85 });
    expect(equal).not.toBeNull();
    expect(lateStage).not.toBeNull();
    // Equal weighting is dragged down by early over-projection; stage-matching
    // to a near-complete quarter recovers a factor materially closer to 1.
    expect(lateStage.calibrationFactor).toBeGreaterThan(equal.calibrationFactor + 0.05);
    expect(lateStage.calibrationFactor).toBeGreaterThan(0.8);
    expect(lateStage.calibrationFactor).toBeLessThanOrEqual(1.15);
  });

  it("keeps the calibration factor within sane bounds", () => {
    const audit = buildProjectionAudit({ ...common, targetElapsedFraction: 0.5 });
    expect(audit.calibrationFactor).toBeGreaterThanOrEqual(0.5);
    expect(audit.calibrationFactor).toBeLessThanOrEqual(1.5);
  });
});
