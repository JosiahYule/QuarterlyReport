import { describe, expect, it } from "vitest";
import { resolveLandingQuarter } from "./usePublishedQuarters.js";
import { QUARTERS } from "../config.js";

const [current, prev, older] = QUARTERS;
const stay = null;

describe("resolveLandingQuarter", () => {
  // The case this was written for: three weeks into a new fiscal year the
  // current quarter has no report, but the one that just closed does.
  it("moves a defaulted quarter to the newest one with a report", () => {
    expect(
      resolveLandingQuarter({
        quarter: current.id,
        quarterExplicit: false,
        published: [prev, older],
      })
    ).toBe(prev.id);
  });

  it("stays put when the current quarter has a report", () => {
    expect(
      resolveLandingQuarter({
        quarter: current.id,
        quarterExplicit: false,
        published: [current, prev],
      })
    ).toBe(stay);
  });

  // A quarter in the URL was chosen from the menu or arrived in a shared
  // link. Redirecting off it would break both.
  it("never overrules a quarter the reader asked for", () => {
    expect(
      resolveLandingQuarter({
        quarter: current.id,
        quarterExplicit: true,
        published: [prev, older],
      })
    ).toBe(stay);
  });

  it("waits while the lookup is still outstanding", () => {
    expect(resolveLandingQuarter({ quarter: current.id, quarterExplicit: false, published: null })).toBe(
      stay
    );
  });

  // Nothing published anywhere, or the lookup failed and resolved to []. Both
  // leave the empty state to do the explaining rather than bouncing the reader.
  it("stays put when no quarter has anything", () => {
    expect(resolveLandingQuarter({ quarter: current.id, quarterExplicit: false, published: [] })).toBe(stay);
  });

  // published is ordered most-recent-first, so the newest wins even when the
  // gap is more than one quarter.
  it("picks the newest, not merely the first available", () => {
    expect(
      resolveLandingQuarter({
        quarter: current.id,
        quarterExplicit: false,
        published: [older, prev],
      })
    ).toBe(older.id);
  });

  // Resolving to the quarter already on screen would re-render for nothing and
  // could loop, since the redirect leaves the quarter implicit.
  it("returns null rather than the quarter already shown", () => {
    const out = resolveLandingQuarter({
      quarter: prev.id,
      quarterExplicit: false,
      published: [prev, older],
    });
    expect(out).toBe(stay);
  });
});
