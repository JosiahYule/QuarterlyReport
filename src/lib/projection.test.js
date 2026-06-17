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
    // Compare the raw (pre-dampening) ratio so this isolates stage-weighting.
    // Equal weighting is dragged down by early over-projection; stage-matching
    // to a near-complete quarter recovers a ratio materially closer to 1.
    expect(lateStage.accuracyRatio).toBeGreaterThan(equal.accuracyRatio + 0.05);
    expect(lateStage.accuracyRatio).toBeGreaterThan(0.8);
  });

  it("keeps the calibration factor within sane bounds", () => {
    const audit = buildProjectionAudit({ ...common, targetElapsedFraction: 0.5 });
    expect(audit.calibrationFactor).toBeGreaterThanOrEqual(0.5);
    expect(audit.calibrationFactor).toBeLessThanOrEqual(1.5);
  });
});

describe("buildProjectionAudit — self-dampening on poor fit", () => {
  const lastVal = snaps => snaps[snaps.length - 1].vals.m;
  const base = {
    metric,
    completedQuarter: { start: qStart, end: qEnd },
    previousQuarter: { start: new Date(2025, 11, 1), end: qStart },
    previousQuarterValue: 1800,
    twoBackValue: null,
    targetElapsedFraction: 0.85,
  };

  it("keeps near-full confidence on a clean, dense prior quarter", () => {
    const snapshotHistory = decelSnapshots();
    const audit = buildProjectionAudit({ ...base, actualValue: lastVal(snapshotHistory), snapshotHistory });
    expect(audit.calibrationConfidence).toBeGreaterThan(0.8);
    // A real correction survives — it is not shrunk away to ≈1.
    expect(audit.calibrationFactor).toBeGreaterThan(0.8);
    expect(audit.calibrationFactor).toBeLessThan(0.95);
  });

  it("shrinks the factor toward 1 when the fit was scattered", () => {
    // Same decelerating trend, but a day-to-day zig-zag so the fit is noisy.
    const snapshotHistory = decelSnapshots().map((s, i) => ({
      t: s.t, vals: { m: s.vals.m * (1 + (i % 2 ? -0.06 : 0.06)) },
    }));
    const clean = buildProjectionAudit({ ...base, actualValue: lastVal(decelSnapshots()), snapshotHistory: decelSnapshots() });
    const noisy = buildProjectionAudit({ ...base, actualValue: lastVal(snapshotHistory), snapshotHistory });
    expect(noisy.calibrationConfidence).toBeLessThan(clean.calibrationConfidence);
    // The damped factor is at least as close to 1 as the raw clamped ratio.
    const rawClamped = Math.min(1.5, Math.max(0.5, noisy.accuracyRatio));
    expect(Math.abs(noisy.calibrationFactor - 1)).toBeLessThanOrEqual(Math.abs(rawClamped - 1) + 1e-9);
  });

  it("shrinks the factor toward 1 when near-stage support is thin", () => {
    // Only three snapshots in the whole quarter → little effective support.
    const all = decelSnapshots();
    const snapshotHistory = [all[12], all[50], all[85]];
    const audit = buildProjectionAudit({ ...base, actualValue: lastVal(all), snapshotHistory });
    expect(audit).not.toBeNull();
    expect(audit.calibrationConfidence).toBeLessThan(0.7);
  });
});
