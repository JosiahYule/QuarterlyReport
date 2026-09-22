// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useUrlState } from "./useUrlState.js";
import { QUARTERS, CURRENT_QUARTER } from "../config.js";

const go = (search) => window.history.replaceState(null, "", "/" + search);

beforeEach(() => go(""));
afterEach(() => go(""));

describe("reading the URL", () => {
  it("falls back to today's quarter when none is in the URL", () => {
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].quarter).toBe(CURRENT_QUARTER.suffix);
  });

  // The distinction the whole default-quarter behaviour rests on: a quarter
  // nobody asked for may be replaced, one in the URL may not.
  it("marks a defaulted quarter as not explicit", () => {
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].quarterExplicit).toBe(false);
  });

  it("marks a quarter taken from the URL as explicit", () => {
    go("?quarter=" + QUARTERS[1].suffix);
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].quarter).toBe(QUARTERS[1].suffix);
    expect(result.current[0].quarterExplicit).toBe(true);
  });

  // An unrecognised suffix is not an answer, so it must not lock out the
  // default the way a real one does.
  it("treats an unknown quarter as no quarter at all", () => {
    go("?quarter=q9");
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].quarter).toBe(CURRENT_QUARTER.suffix);
    expect(result.current[0].quarterExplicit).toBe(false);
  });
});

describe("navigating", () => {
  it("treats a quarter the reader picks as explicit, and adds history", () => {
    const { result } = renderHook(() => useUrlState());
    const before = window.history.length;
    act(() => result.current[1]({ quarter: QUARTERS[2].suffix }));
    expect(result.current[0].quarterExplicit).toBe(true);
    expect(window.history.length).toBeGreaterThan(before);
    expect(new URLSearchParams(window.location.search).get("quarter")).toBe(QUARTERS[2].suffix);
  });

  // The app correcting its own default is not the reader choosing, and must
  // not cost them a Back press to escape.
  it("keeps a replaced quarter implicit and does not add history", () => {
    const { result } = renderHook(() => useUrlState());
    const before = window.history.length;
    act(() => result.current[1]({ quarter: QUARTERS[1].suffix }, { replace: true }));
    expect(result.current[0].quarter).toBe(QUARTERS[1].suffix);
    expect(result.current[0].quarterExplicit).toBe(false);
    expect(window.history.length).toBe(before);
  });

  it("leaves explicitness alone when only the view changes", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current[1]({ view: "web" }));
    expect(result.current[0].quarterExplicit).toBe(false);

    act(() => result.current[1]({ quarter: QUARTERS[1].suffix }));
    act(() => result.current[1]({ view: "social" }));
    expect(result.current[0].quarterExplicit).toBe(true);
  });

  // quarterExplicit is internal bookkeeping. Writing it to the query string
  // would put it in every link anyone copies out of the address bar.
  it("writes only agency, quarter and view to the URL", () => {
    const { result } = renderHook(() => useUrlState());
    act(() => result.current[1]({ view: "web" }));
    const keys = [...new URLSearchParams(window.location.search).keys()].sort();
    expect(keys).toEqual(["agency", "quarter", "view"]);
  });
});
