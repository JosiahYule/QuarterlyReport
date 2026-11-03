import { calcAutoDelta } from "../utils.js";
import { REPORT_TZ } from "../config.js";

// How much of its quarter a report's figures cover, and how to compare a
// partial quarter with a finished one without it reading as a collapse.
//
// The figures are typed into the admin by hand, part way through a quarter as
// well as after it closes. Set beside all of the quarter before, two months of
// impressions against three looked like a 70% fall. So a report carries how far
// through its quarter its figures reach, and each comparison is made in a way
// that is fair at that point.
//
// "How far through" is taken from when the report was last saved, not from
// today. Figures saved on 23 October describe the quarter up to 23 October,
// however many days later someone reads them.

const DAY = 86_400_000;

// Before this share of the quarter has passed, a pace is mostly noise: one
// strong week at the start projects to a record quarter.
export const MIN_PACE_FRACTION = 0.15;

// Where the figures stand within quarter `q`, given when they were last saved.
//
//   { complete: true }                    saved after the quarter ended, or
//                                         no save time known
//   { complete: false, asOf, fraction }   saved while it was still running;
//                                         fraction is 0 to 1 of its length
export function quarterCoverage(q, savedAt) {
  const asOf = savedAt ? new Date(savedAt) : null;
  if (!q || !asOf || Number.isNaN(asOf.getTime()) || asOf >= q.end) return { complete: true, fraction: 1 };
  const span = q.end - q.start;
  const fraction = Math.min(1, Math.max(0, (asOf - q.start) / span));
  return { complete: false, asOf, fraction, days: Math.round(span / DAY) };
}

// The three ways a metric can behave part way through a quarter.
//
//   total   Adds up day by day (posts, impressions, sessions). A partial total
//           is compared at its pace: what it would reach by the quarter's end
//           if the rest went the same way.
//   level   A rate or a count at a point in time (engagement rate, followers).
//           It is as meaningful on day 40 as on day 90, so it is compared as is.
//   unique  A count of distinct people (unique users, reach). The same person
//           coming back adds nothing, so it grows slower than the calendar and
//           a straight-line pace overstates it. No fair partial comparison
//           exists, so none is shown.
export const TOTAL = "total";
export const LEVEL = "level";
export const UNIQUE = "unique";

// A metric's change against the quarter before, made fair for a partial
// quarter.
//
//   delta      what the Delta badge shows, or null for no comparison
//   paced      true when delta compares the pace, not the raw figure
//   projected  the figure the pace points to, when paced
export function compareMetric(kind, cur, prev, coverage) {
  if (!coverage || coverage.complete || kind === LEVEL) {
    return { delta: calcAutoDelta(cur, prev), paced: false, projected: null };
  }
  if (kind === TOTAL && typeof cur === "number" && coverage.fraction >= MIN_PACE_FRACTION) {
    // The delta uses the exact pace; the figure shown is rounded, since a
    // projection to the post or the visit is precision it doesn't have.
    const pace = cur / coverage.fraction;
    return { delta: calcAutoDelta(pace, prev), paced: true, projected: Math.round(pace) };
  }
  return { delta: null, paced: false, projected: null };
}

// "Nov 3", in the agencies' own timezone so every reader sees the same date.
export function asOfLabel(coverage) {
  if (!coverage?.asOf) return "";
  return coverage.asOf.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: REPORT_TZ });
}
