import { describe, it, expect } from "vitest";
import { computeAdvancedPace, computeSporadicPace, buildProjectionAudit } from "./projection.js";

// Guards for the "projected final equals the to-date total" bug: a late,
// back-loaded quarter pushed the full-quarter regression's endpoint below what
// was already banked, and calibration then discounted the banked total too,
// so the max(…, current) floor caught the headline and pinned it there.

const DAY = 86400000;

// ─── ISL Q1 2026 (Sep–Nov), pinned to the Nov 25 snapshots ─────────
// One snapshot a day at 11:00 UTC from Sep 4 through Nov 25, as captured by
// the projection-snapshots cron. The quarter is back-loaded (28K impressions
// by Oct 22, 97K by Nov 25), which is exactly the shape that broke it.
const ISL_Q1_IMPRESSIONS = [
  1767, 1767, 1767, 1767, 1767, 4522, 4761, 5483, 7207, 7207, 7207, 7207, 13576, 14665, 15465, 16141, 16141,
  16141, 18996, 19759, 20739, 20739, 20739, 20739, 20739, 24031, 24462, 24462, 24462, 24462, 24462, 24462,
  28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088, 28088,
  28088, 28088, 45266, 46085, 46085, 46085, 47479, 47479, 48123, 48935, 49732, 49732, 49732, 49732, 51432,
  52154, 63000, 63000, 63000, 63000, 67000, 69000, 69000, 73000, 77500, 77500, 77500, 85500, 85500, 87500,
  91363, 92763, 92763, 92763, 95763, 97200,
];
const ISL_Q1_REACTIONS = [
  75, 75, 75, 75, 75, 93, 93, 109, 134, 134, 134, 134, 239, 248, 259, 272, 272, 272, 315, 318, 318, 318, 318,
  318, 318, 328, 369, 369, 369, 369, 369, 369, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390, 390,
  390, 390, 390, 390, 390, 533, 547, 547, 547, 569, 569, 576, 613, 631, 631, 631, 631, 768, 800, 825, 825,
  825, 825, 841, 856, 856, 880, 949, 949, 949, 1002, 1002, 1022, 1058, 1069, 1069, 1069, 1088, 1106,
];
const islStart = new Date(2026, 8, 1); // Sep 1
const islEnd = new Date(2026, 11, 1); // Dec 1 (exclusive)
const islAsOf = new Date("2026-11-25T20:00:00Z");
const islHistory = (vals) => vals.map((val, i) => ({ t: Date.UTC(2026, 8, 4 + i, 11), val }));

describe("ISL Q1 2026 regression case (Nov 25)", () => {
  // The dashboard's to-date totals and the Q4 calibration factors in force.
  const cases = [
    { name: "impressions", vals: ISL_Q1_IMPRESSIONS, current: 99200, cal: 0.973892199091655 },
    { name: "reactions", vals: ISL_Q1_REACTIONS, current: 1141, cal: 0.9655858986388983 },
  ];

  for (const { name, vals, current, cal } of cases) {
    const pace = computeAdvancedPace(current, islStart, islEnd, null, islHistory(vals), 0, islAsOf, cal);

    it(`${name}: projects growth over the last five days instead of pinning to the to-date total`, () => {
      // Recent pace is ~1.35K impressions / ~11 reactions a day with ~5 days
      // left, so the final should clear the banked total by a real margin.
      expect(pace.projected).toBeGreaterThan(current * 1.03);
    });

    it(`${name}: no component projects a final below what is already banked`, () => {
      for (const v of [pace.components.simple, pace.components.rolling, pace.components.reg]) {
        expect(v).toBeGreaterThanOrEqual(current);
      }
    });
  }

  it("impressions land where the three methods now agree (~105K), not at 99.2K", () => {
    const pace = computeAdvancedPace(
      99200,
      islStart,
      islEnd,
      null,
      islHistory(ISL_Q1_IMPRESSIONS),
      0,
      islAsOf,
      0.973892199091655
    );
    expect(pace.projected).toBeGreaterThan(103000);
    expect(pace.projected).toBeLessThan(108000);
    // The methods agreeing is what keeps the likely range honest: the old
    // regression sat ~17% away from the others and blew the band out to 111K.
    const comps = [pace.components.simple, pace.components.rolling, pace.components.reg];
    expect((Math.max(...comps) - Math.min(...comps)) / pace.projected).toBeLessThan(0.03);
  });
});

// ─── Synthetic shapes ──────────────────────────────────────────────
const qStart = new Date(2026, 2, 1); // Mar 1
const qEnd = new Date(2026, 5, 1); // Jun 1 (exclusive), 92 days

// Accelerating cumulative series: daily increments grow from 2/day to ~30/day.
function accelHistory(days) {
  const out = [];
  let acc = 0;
  for (let i = 0; i <= days; i++) {
    if (i > 0) acc += 2 + 0.3 * i;
    out.push({ t: qStart.getTime() + i * DAY, val: acc });
  }
  return out;
}

describe("regression anchored at the banked total", () => {
  it("never projects below the current total on an accelerating quarter, at any stage", () => {
    for (const day of [20, 40, 60, 80, 88]) {
      const hist = accelHistory(day);
      const current = hist[hist.length - 1].val;
      const pace = computeAdvancedPace(current, qStart, qEnd, null, hist, 0, new Date(hist[day].t));
      expect(pace.components.reg).toBeGreaterThanOrEqual(current);
    }
  });

  it("carries the full-quarter least-squares rate forward from current", () => {
    // Perfectly linear 10/day: slope is exactly 10, so reg = current + 10 × days left.
    const hist = [];
    for (let i = 0; i <= 60; i++) hist.push({ t: qStart.getTime() + i * DAY, val: 10 * i });
    const pace = computeAdvancedPace(600, qStart, qEnd, null, hist, 0, new Date(hist[60].t));
    expect(pace.components.reg).toBeCloseTo(600 + 10 * 32, 6);
  });
});

describe("calibration scales only the un-banked remainder", () => {
  const linear = [];
  for (let i = 0; i <= 87; i++) linear.push({ t: qStart.getTime() + i * DAY, val: 10 * i });
  const asOf = new Date(linear[87].t);

  it("a below-1 factor late in the quarter can't erase the remaining growth", () => {
    // 5 days left at 10/day. Scaling the whole 920 total by 0.9 used to give
    // 828 and pin the headline to the 870 already banked.
    const pace = computeAdvancedPace(870, qStart, qEnd, null, linear, 0, asOf, 0.9);
    expect(pace.projected).toBeCloseTo(870 + 50 * 0.9, 6);
  });

  it("leaves the banked total untouched however hard the factor cuts", () => {
    const raw = computeAdvancedPace(870, qStart, qEnd, null, linear, 0, asOf, 1);
    const cut = computeAdvancedPace(870, qStart, qEnd, null, linear, 0, asOf, 0.5);
    expect(cut.projected - 870).toBeCloseTo((raw.projected - 870) * 0.5, 6);
    for (const v of [cut.components.simple, cut.components.rolling, cut.components.reg]) {
      expect(v).toBeGreaterThanOrEqual(870);
    }
  });

  it("applies the same rule in the sporadic (comments) model", () => {
    const hist = [];
    for (let i = 0; i <= 80; i++) hist.push({ t: qStart.getTime() + i * DAY, val: 2 * i });
    const asOf80 = new Date(hist[80].t);
    const raw = computeSporadicPace(160, qStart, qEnd, hist, asOf80, 1);
    const cut = computeSporadicPace(160, qStart, qEnd, hist, asOf80, 0.8);
    expect(raw.projected).toBeGreaterThan(160);
    expect(cut.projected - 160).toBeCloseTo((raw.projected - 160) * 0.8, 6);
  });
});

describe("buildProjectionAudit — calibration learned on the remaining portion", () => {
  const metric = { id: "m", label: "m", isPace: true };
  const base = {
    metric,
    completedQuarter: { start: qStart, end: qEnd },
    previousQuarter: { start: new Date(2025, 11, 1), end: qStart },
    previousQuarterValue: 1800,
    twoBackValue: null,
  };
  const toSnaps = (hist) => hist.map((s) => ({ t: s.t, vals: { m: s.val } }));

  it("learns no correction from a quarter the model called exactly", () => {
    const hist = [];
    for (let i = 0; i < 92; i++) hist.push({ t: qStart.getTime() + i * DAY, val: 10 * i });
    const audit = buildProjectionAudit({
      ...base,
      actualValue: 920,
      snapshotHistory: toSnaps(hist),
      targetElapsedFraction: 0.8,
    });
    expect(audit.remainingRatio).toBeCloseTo(1, 1);
    expect(audit.calibrationFactor).toBeCloseTo(1, 1);
  });

  it("moves a late-quarter projection toward the actual final, not onto the floor", () => {
    // Decelerating quarter: the model over-guesses what's left. Learn the
    // factor from it, then re-project the same quarter at 85% elapsed.
    const hist = [];
    let acc = 0;
    for (let i = 0; i < 92; i++) {
      acc += Math.max(0, 40 - 0.4 * i);
      hist.push({ t: qStart.getTime() + i * DAY, val: acc });
    }
    const actual = hist[91].val;
    const audit = buildProjectionAudit({
      ...base,
      actualValue: actual,
      snapshotHistory: toSnaps(hist),
      targetElapsedFraction: 0.85,
    });
    const day = 78;
    const sofar = hist.slice(0, day + 1);
    const current = sofar[day].val;
    const at = (c) =>
      computeAdvancedPace(current, qStart, qEnd, null, sofar, 0, new Date(sofar[day].t), c).projected;

    const uncalibrated = at(1);
    const calibrated = at(audit.calibrationFactor);
    expect(Math.abs(calibrated - actual)).toBeLessThan(Math.abs(uncalibrated - actual));
    expect(calibrated).toBeGreaterThan(current);
  });
});
