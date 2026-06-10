import { describe, it, expect } from "vitest";
import { fmt, fmtExact, fmtPct, fmtTime, toNumber, calcAutoDelta, parseDelta } from "./utils.js";

describe("fmt", () => {
  it("abbreviates large numbers", () => {
    expect(fmt(2_450_000)).toBe("2.45M");
    expect(fmt(12_300)).toBe("12K");
    expect(fmt(1_500)).toBe("1.5K");
  });
  it("renders small integers with locale grouping", () => {
    expect(fmt(999)).toBe("999");
  });
  it("renders null/undefined as em dash", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
  });
});

describe("fmtExact / fmtPct / fmtTime", () => {
  it("formats exact integers", () => {
    expect(fmtExact(1234567)).toBe((1234567).toLocaleString());
    expect(fmtExact(null)).toBe("—");
  });
  it("formats percentages to one decimal", () => {
    expect(fmtPct(4.267)).toBe("4.3%");
    expect(fmtPct(NaN)).toBe("—");
  });
  it("formats seconds as m:ss", () => {
    expect(fmtTime(125)).toBe("2:05");
    expect(fmtTime(null)).toBe("—");
  });
});

describe("toNumber", () => {
  it("parses formatted strings", () => {
    expect(toNumber("1,234")).toBe(1234);
    expect(toNumber("12.5%")).toBe(12.5);
    expect(toNumber("▲ 42")).toBe(42);
    expect(toNumber("+7")).toBe(7);
  });
  it("rejects non-numeric input", () => {
    expect(toNumber("—")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe("calcAutoDelta", () => {
  it("computes percentage change with direction", () => {
    expect(calcAutoDelta(110, 100)).toEqual({ dir: "up", pct: 10 });
    expect(calcAutoDelta(90, 100)).toEqual({ dir: "down", pct: 10 });
    expect(calcAutoDelta(100, 100)).toEqual({ dir: "flat", pct: 0 });
  });
  it("returns null for invalid input or zero baseline", () => {
    expect(calcAutoDelta(100, 0)).toBeNull();
    expect(calcAutoDelta(null, 100)).toBeNull();
    expect(calcAutoDelta("100", 50)).toBeNull();
  });
});

describe("parseDelta", () => {
  it("passes through structured deltas", () => {
    expect(parseDelta({ dir: "up", pct: 5 })).toEqual({ dir: "up", pct: 5 });
  });
  it("parses arrow strings", () => {
    expect(parseDelta("▲ 12.5%")).toEqual({ dir: "up", pct: 12.5 });
    expect(parseDelta("▼ 3%")).toEqual({ dir: "down", pct: 3 });
  });
  it("defaults to flat", () => {
    expect(parseDelta(null)).toEqual({ dir: "flat", pct: 0 });
  });
});
