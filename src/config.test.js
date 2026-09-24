import { describe, it, expect } from "vitest";
import {
  quarterForMonthYear,
  previousQuarter,
  quarterFromId,
  quarterFromKey,
  resolveQuarter,
  QUARTERS,
  TRENDS_QUARTERS,
  CURRENT_QUARTER,
  FIRST_QUARTER,
} from "./config.js";

describe("quarterForMonthYear (fiscal year starts September)", () => {
  it("maps months to the right fiscal quarter", () => {
    expect(quarterForMonthYear(8, 2025).suffix).toBe("q1"); // September
    expect(quarterForMonthYear(10, 2025).suffix).toBe("q1"); // November
    expect(quarterForMonthYear(11, 2025).suffix).toBe("q2"); // December
    expect(quarterForMonthYear(1, 2026).suffix).toBe("q2"); // February (wraps year)
    expect(quarterForMonthYear(2, 2026).suffix).toBe("q3"); // March
    expect(quarterForMonthYear(5, 2026).suffix).toBe("q4"); // June
    expect(quarterForMonthYear(7, 2026).suffix).toBe("q4"); // August
  });

  it("produces contiguous start/end boundaries", () => {
    const q1 = quarterForMonthYear(8, 2025);
    const q2 = quarterForMonthYear(11, 2025);
    expect(q1.end.getTime()).toBe(q2.start.getTime());
  });

  // Built once and cached, so the same quarter is always the same object and
  // `===`, Set and includes() all work on quarters directly.
  it("returns the same object for the same quarter however it is reached", () => {
    const q = quarterForMonthYear(0, 2026);
    expect(quarterForMonthYear(11, 2025)).toBe(q);
    expect(quarterFromKey("q2", "2026")).toBe(q);
    expect(previousQuarter(quarterForMonthYear(2, 2026))).toBe(q);
  });
});

describe("the database key (suffix + year)", () => {
  it("labels the quarter with the calendar year of its last day", () => {
    const q2 = quarterForMonthYear(0, 2026); // January → Q2 Dec 2025–Feb 2026
    expect(q2.year).toBe("2026");
    expect(q2.start.getFullYear()).toBe(2025);
  });

  it("gives the same suffix different years across a fiscal-year boundary", () => {
    // The whole reason the year exists: this September's q1 and next
    // September's are different quarters, and the database must hold both.
    const thisQ1 = quarterForMonthYear(9, 2025);
    const nextQ1 = quarterForMonthYear(9, 2026);
    expect(thisQ1.suffix).toBe(nextQ1.suffix);
    expect(thisQ1.year).not.toBe(nextQ1.year);
  });

  it("round-trips through quarterFromKey", () => {
    for (const m of [0, 3, 6, 9]) {
      const q = quarterForMonthYear(m, 2026);
      expect(quarterFromKey(q.suffix, q.year)).toBe(q);
    }
    expect(quarterFromKey("q9", "2026")).toBeNull();
    expect(quarterFromKey("q1", "later")).toBeNull();
  });
});

describe("what readers see", () => {
  // The bug this naming fixes: under the database year, Sep–Nov 2026 was
  // "Q1 2026" and read as older than "Q4 2026" (Jun–Aug 2026).
  it("names quarters by fiscal year, so they read in order", () => {
    const q4 = quarterForMonthYear(6, 2026); // Jul 2026
    const q1 = quarterForMonthYear(9, 2026); // Oct 2026
    expect(q4.title).toBe("Q4 2025–26");
    expect(q1.title).toBe("Q1 2026–27");
  });

  it("keeps a whole fiscal year under one name", () => {
    const years = [8, 11, 2, 5].map((m, i) => quarterForMonthYear(m, i < 2 ? 2026 : 2027).fiscalYear);
    expect(new Set(years)).toEqual(new Set(["2026–27"]));
  });

  it("gives Q2 a range that says which December", () => {
    const q2 = quarterForMonthYear(11, 2026);
    expect(q2.rangeLabel).toBe("Dec 2026–Feb 2027");
    expect(q2.months).toBe("Dec–Feb");
    expect(quarterForMonthYear(9, 2026).rangeLabel).toBe("Sep–Nov 2026");
  });

  it("gives every quarter an id spelled like its title", () => {
    expect(quarterForMonthYear(11, 2026).id).toBe("q2-2026-27");
    expect(quarterForMonthYear(3, 2026).id).toBe("q3-2025-26");
  });
});

describe("previousQuarter", () => {
  it("steps back across the calendar year and the fiscal year", () => {
    const q3 = quarterForMonthYear(2, 2026); // Mar–May 2026
    expect(previousQuarter(q3).rangeLabel).toBe("Dec 2025–Feb 2026");
    const q1 = quarterForMonthYear(8, 2026); // Sep–Nov 2026
    expect(previousQuarter(q1).title).toBe("Q4 2025–26");
  });

  // Deltas used to come from the next entry in a four-quarter menu, so the
  // oldest quarter on offer had none even when the data existed.
  it("exists for every quarter, including the oldest a reader can open", () => {
    expect(previousQuarter(QUARTERS.at(-1)).end.getTime()).toBe(QUARTERS.at(-1).start.getTime());
  });
});

describe("derived quarter lists", () => {
  it("QUARTERS runs from the current quarter back to the first, contiguously", () => {
    expect(QUARTERS[0]).toBe(CURRENT_QUARTER);
    expect(QUARTERS.at(-1)).toBe(FIRST_QUARTER);
    for (let i = 0; i < QUARTERS.length - 1; i++) {
      expect(QUARTERS[i + 1].end.getTime()).toBe(QUARTERS[i].start.getTime());
    }
  });

  it("starts at Q1 2025–26, the first quarter the report covers", () => {
    expect(FIRST_QUARTER.id).toBe("q1-2025-26");
  });

  it("TRENDS_QUARTERS is three consecutive quarters ending at the current one", () => {
    expect(TRENDS_QUARTERS).toHaveLength(3);
    expect(TRENDS_QUARTERS[2]).toBe(CURRENT_QUARTER);
    expect(previousQuarter(TRENDS_QUARTERS[2])).toBe(TRENDS_QUARTERS[1]);
    expect(previousQuarter(TRENDS_QUARTERS[1])).toBe(TRENDS_QUARTERS[0]);
  });
});

describe("quarterFromId", () => {
  it("resolves every openable quarter's id to that quarter", () => {
    for (const q of QUARTERS) expect(quarterFromId(q.id)).toBe(q);
  });

  // Links written before ids carried the fiscal year say "?quarter=q2". They
  // resolve against the last four quarters, the window they were written for.
  it("still opens a bare suffix from an older link", () => {
    for (const q of QUARTERS.slice(0, 4)) expect(quarterFromId(q.suffix)).toBe(q);
  });

  it("rejects anything that is not an openable quarter", () => {
    expect(quarterFromId("q9")).toBeNull();
    expect(quarterFromId(undefined)).toBeNull();
    expect(quarterFromId("q1-2026-28")).toBeNull(); // years that do not follow on
    expect(quarterFromId("q1-2019-20")).toBeNull(); // before the first quarter
    expect(quarterFromId("q1-2099-00")).toBeNull(); // in the future
  });

  it("resolveQuarter falls back to the current quarter", () => {
    expect(resolveQuarter("q9")).toBe(CURRENT_QUARTER);
    expect(resolveQuarter(undefined)).toBe(CURRENT_QUARTER);
  });
});
