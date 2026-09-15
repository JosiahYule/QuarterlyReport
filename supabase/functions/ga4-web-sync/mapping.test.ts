import { describe, expect, it } from "vitest";
import { quarterForMonthYear } from "../../../src/config.js";
import {
  BRANDS,
  buildChannels,
  buildKpis,
  buildPages,
  buildPayload,
  fiscalQuarter,
  isoDate,
  previousQuarter,
  quartersToSync,
  resolvePropertyId,
  labelFromPath,
  normalizePath,
  utc,
} from "./mapping.ts";

const report = (rows: (string | number)[][], dims = 0) => ({
  rows: rows.map((r) => ({
    dimensionValues: r.slice(0, dims).map((v) => ({ value: String(v) })),
    metricValues: r.slice(dims).map((v) => ({ value: String(v) })),
  })),
});

describe("fiscalQuarter", () => {
  // The job computes the quarter in Deno and the app computes it in the
  // browser. Two implementations of one calendar drift silently, and the
  // damage shows up as a whole quarter written under the wrong label, so they
  // are checked against each other across four years of month boundaries.
  it("agrees with the app's own quarter calendar for every month", () => {
    for (let y = 2025; y <= 2028; y++) {
      for (let m = 0; m < 12; m++) {
        const mine = fiscalQuarter(utc(y, m, 15));
        const theirs = quarterForMonthYear(m, y);
        expect(mine.suffix, `${y}-${m + 1} suffix`).toBe(theirs.suffix);
        expect(mine.year, `${y}-${m + 1} year`).toBe(theirs.year);
        expect(mine.start.getUTCMonth(), `${y}-${m + 1} start month`).toBe(theirs.start.getMonth());
        expect(mine.start.getUTCFullYear(), `${y}-${m + 1} start year`).toBe(
          theirs.start.getFullYear()
        );
      }
    }
  });

  it("puts September through November in Q1 of that calendar year", () => {
    const q = fiscalQuarter(utc(2026, 8, 15));
    expect(q).toMatchObject({ suffix: "q1", year: "2026" });
    expect(isoDate(q.start)).toBe("2026-09-01");
  });

  // The one quarter whose label is not the calendar year of its own first
  // month: Q2 opens in December but closes at the end of February.
  it("labels December with the following year, since Q2 closes in February", () => {
    const q = fiscalQuarter(utc(2026, 11, 3));
    expect(q).toMatchObject({ suffix: "q2", year: "2027" });
    expect(isoDate(q.start)).toBe("2026-12-01");
  });

  it("puts January and February in the Q2 that opened the previous December", () => {
    for (const m of [0, 1]) {
      const q = fiscalQuarter(utc(2027, m, 10));
      expect(q).toMatchObject({ suffix: "q2", year: "2027" });
      expect(isoDate(q.start)).toBe("2026-12-01");
    }
  });

  it("puts March through May in Q3 and June through August in Q4", () => {
    expect(fiscalQuarter(utc(2027, 2, 1))).toMatchObject({ suffix: "q3", year: "2027" });
    expect(fiscalQuarter(utc(2027, 4, 31))).toMatchObject({ suffix: "q3", year: "2027" });
    expect(fiscalQuarter(utc(2027, 5, 1))).toMatchObject({ suffix: "q4", year: "2027" });
    expect(fiscalQuarter(utc(2027, 7, 31))).toMatchObject({ suffix: "q4", year: "2027" });
  });
});

describe("buildKpis", () => {
  // GA4 returns engagementRate as a ratio; web_kpis.engagement_rate is stored
  // as a percentage, which is where a silent factor of 100 would live.
  it("converts the engagement ratio to the percentage the column stores", () => {
    const k = buildKpis(report([[27880, 19809, 0.5053, 2425560]]))!;
    expect(k.engagement_rate).toBe(50.53);
  });

  it("derives average engagement time per session, which GA4 has no metric for", () => {
    // 2,425,560 engaged seconds over 27,880 sessions = 87s, the figure the
    // report has been showing.
    expect(buildKpis(report([[27880, 19809, 0.5053, 2425560]]))!.avg_engagement_time_sec).toBe(87);
  });

  it("passes sessions and users straight through", () => {
    const k = buildKpis(report([[27880, 19809, 0.5053, 2425560]]))!;
    expect(k).toMatchObject({ sessions: 27880, users: 19809 });
  });

  // "A partial write is worse than no write": an empty GA4 answer has to be
  // distinguishable from a real zero, or the job overwrites a good quarter
  // with nothing.
  it("returns null rather than zero when GA4 has no sessions", () => {
    expect(buildKpis({ rows: [] })).toBeNull();
    expect(buildKpis({})).toBeNull();
    expect(buildKpis(report([[0, 0, 0, 0]]))).toBeNull();
  });

  it("never reports actions or form_submissions, which GA4 cannot supply", () => {
    const k = buildKpis(report([[100, 80, 0.5, 6000]]))!;
    expect(k).not.toHaveProperty("actions");
    expect(k).not.toHaveProperty("form_submissions");
  });
});

describe("buildChannels", () => {
  // WebPage.jsx matches channels across quarters by lowercased name. GA4 says
  // "Organic Social" where every stored quarter says "Social"; without the
  // alias the delta arrow silently disappears.
  it("renames GA4's Organic Social to the Social the report already uses", () => {
    const c = buildChannels(report([["Organic Social", 1310, 0.3422]], 1))!;
    expect(c[0].name).toBe("Social");
  });

  it("leaves the other channel names as GA4 spells them", () => {
    const c = buildChannels(
      report(
        [
          ["Organic Search", 8873, 0.6252],
          ["Direct", 17045, 0.3768],
          ["Referral", 717, 0.6712],
        ],
        1
      )
    )!;
    expect(c.map((x) => x.name)).toEqual(["Organic Search", "Direct", "Referral"]);
  });

  it("computes share of traffic, which GA4 has no metric for, summing to 100", () => {
    const c = buildChannels(
      report(
        [
          ["Direct", 750, 0.4],
          ["Organic Search", 250, 0.6],
        ],
        1
      )
    )!;
    expect(c.map((x) => x.share_of_traffic)).toEqual([75, 25]);
    expect(c.reduce((s, x) => s + x.share_of_traffic, 0)).toBe(100);
  });

  it("converts channel engagement rates to percentages too", () => {
    expect(buildChannels(report([["Direct", 100, 0.3768]], 1))![0].engagement_rate).toBe(37.68);
  });

  it("returns null when GA4 has no channel rows, so nothing is written", () => {
    expect(buildChannels({ rows: [] })).toBeNull();
    expect(buildChannels(report([["Direct", 0, 0]], 1))).toBeNull();
  });
});

describe("normalizePath and labelFromPath", () => {
  it("folds query strings, fragments, casing and trailing slashes onto one path", () => {
    for (const p of ["/find-work", "/find-work/", "/Find-Work", "/find-work?utm_source=li", "/find-work#top"]) {
      expect(normalizePath(p), p).toBe("/find-work");
    }
  });

  it("treats an empty path and a bare slash as the root", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/")).toBe("/");
  });

  it("derives a readable label from a slug for brands with no configured map", () => {
    expect(labelFromPath("/")).toBe("Home Page");
    expect(labelFromPath("/direct-hire")).toBe("Direct Hire");
    expect(labelFromPath("/find_work")).toBe("Find Work");
  });
});

describe("buildPages", () => {
  const ISL = BRANDS.isl.pageLabels;

  it("uses the configured label rather than the raw GA4 path", () => {
    const p = buildPages(report([["/", 18363, 0.4151, 863000, 18363]], 1), ISL);
    expect(p[0].key).toBe("Home Page");
  });

  // Top Pages has always meant the site's main sections. GA4's raw top-N
  // would be swamped by individual job postings, and the report would stop
  // comparing to previous quarters.
  it("keeps only the configured pages when a brand has a map", () => {
    const p = buildPages(
      report(
        [
          ["/jobs/welder-halifax", 90000, 0.9, 10, 9],
          ["/find-work", 17294, 0.5886, 1245168, 17294],
        ],
        1
      ),
      ISL
    );
    expect(p.map((x) => x.key)).toEqual(["Find Work"]);
  });

  it("takes GA4's pages as they come when a brand has no map configured", () => {
    const p = buildPages(report([["/services", 500, 0.5, 5000, 250]], 1), {});
    expect(p[0].key).toBe("Services");
  });

  it("merges paths that normalize together instead of listing them twice", () => {
    const p = buildPages(
      report(
        [
          ["/contact", 2000, 0.7, 300000, 2000],
          ["/contact/", 627, 0.6, 90000, 627],
        ],
        1
      ),
      ISL
    );
    expect(p).toHaveLength(1);
    expect(p[0].page_views).toBe(2627);
  });

  // Averaging the two rates would weight a 6-view page like a 6,000-view one.
  it("re-derives the bounce rate from merged totals rather than averaging", () => {
    const p = buildPages(
      report(
        [
          ["/about", 900, 0.8, 0, 0],
          ["/about/", 100, 0.3, 0, 0],
        ],
        1
      ),
      ISL
    );
    // (0.8*900 + 0.3*100) / 1000 = 0.75
    expect(p[0].bounce_rate).toBe(75);
  });

  it("orders by views and caps the list", () => {
    const p = buildPages(
      report(
        [
          ["/about", 100, 0.5, 1000, 50],
          ["/contact", 900, 0.5, 9000, 450],
        ],
        1
      ),
      ISL
    );
    expect(p.map((x) => x.key)).toEqual(["Contact", "About"]);
  });

  it("returns nothing when no GA4 path matches the map, so the caller can leave pages alone", () => {
    expect(buildPages(report([["/nothing-we-know-about", 10, 0.5, 100, 5]], 1), ISL)).toEqual([]);
  });
});

describe("buildPayload", () => {
  const quarter = { suffix: "q1", year: "2026", start: utc(2026, 8, 1) };
  const kpis = { sessions: 1, users: 1, engagement_rate: 1, avg_engagement_time_sec: 1 };
  const channels = [{ name: "Direct", sessions: 1, engagement_rate: 1, share_of_traffic: 100 }];

  // save_web_report merges on key presence. These four absences are the whole
  // reason hand-entered values survive a weekly run, so they are asserted
  // rather than left to inspection.
  it("omits every field the job does not own", () => {
    const p = buildPayload("isl", quarter, kpis, channels, []);
    expect(p).not.toHaveProperty("summary_bullet");
    expect(p).not.toHaveProperty("insights");
    expect(p.kpis).not.toHaveProperty("actions");
    expect(p.kpis).not.toHaveProperty("form_submissions");
  });

  it("keys the write by agency, quarter and year", () => {
    expect(buildPayload("isl", quarter, kpis, channels, [])).toMatchObject({
      agency: "isl",
      quarter: "q1",
      year: "2026",
    });
  });

  it("omits pages entirely when there are none to write, leaving the stored ones alone", () => {
    expect(buildPayload("isl", quarter, kpis, channels, null)).not.toHaveProperty("pages");
    expect(buildPayload("isl", quarter, kpis, channels, [])).toHaveProperty("pages");
  });
});

describe("quartersToSync", () => {
  // The flaw this exists for: the job only ever writes the current quarter, so
  // a quarter ending 31 August is last written by whichever weekly run fell
  // before it, and from 1 September the job has moved on. Without a close-out
  // every quarter in the archive is permanently missing its final days.
  it("reports the current quarter up to yesterday", () => {
    const [{ quarter, endDate }] = quartersToSync(utc(2026, 9, 20));
    expect(quarter).toMatchObject({ suffix: "q1", year: "2026" });
    expect(isoDate(quarter.start)).toBe("2026-09-01");
    expect(isoDate(endDate)).toBe("2026-10-19");
  });

  it("asks for one quarter once the close-out window has passed", () => {
    expect(quartersToSync(utc(2026, 9, 20))).toHaveLength(1);
  });

  it("also closes out the previous quarter just after a rollover", () => {
    const periods = quartersToSync(utc(2026, 8, 7));
    expect(periods).toHaveLength(2);
    const [closing, current] = periods;
    expect(closing.quarter).toMatchObject({ suffix: "q4", year: "2026" });
    // The real final day of the quarter that ended, not yesterday.
    expect(isoDate(closing.quarter.start)).toBe("2026-06-01");
    expect(isoDate(closing.endDate)).toBe("2026-08-31");
    expect(current.quarter).toMatchObject({ suffix: "q1", year: "2026" });
  });

  // The close-out range is fixed, so running it every week inside the window
  // writes the same figures rather than drifting.
  it("uses the same fixed range for the close-out on every run in the window", () => {
    const a = quartersToSync(utc(2026, 8, 3))[0];
    const b = quartersToSync(utc(2026, 8, 12))[0];
    expect(isoDate(a.endDate)).toBe(isoDate(b.endDate));
    expect(isoDate(a.quarter.start)).toBe(isoDate(b.quarter.start));
  });

  // On 1 September, yesterday is 31 August, which is in the previous quarter.
  // Querying the current quarter would invert the range.
  it("skips the current quarter until it contains a complete day", () => {
    const periods = quartersToSync(utc(2026, 8, 1));
    expect(periods.map((p) => p.quarter.suffix)).toEqual(["q4"]);
  });

  it("walks back across the year boundary correctly", () => {
    expect(previousQuarter(fiscalQuarter(utc(2026, 11, 5)))).toMatchObject({
      suffix: "q1",
      year: "2026",
    });
    expect(previousQuarter(fiscalQuarter(utc(2027, 0, 5)))).toMatchObject({
      suffix: "q1",
      year: "2026",
    });
  });
});

describe("resolvePropertyId", () => {
  const brand = { env: "GA4_PROPERTY_ISL", configKey: "ga4_property_isl", pageLabels: {} };

  // An Edge Function secret is the better home for a setting than a database
  // row, so it wins whenever it is set. The database fallback only exists
  // because dashboard access to this project is currently lost; restoring it
  // has to take over silently, with no code change and nothing to undo.
  it("prefers the environment over the database", () => {
    expect(
      resolvePropertyId(brand, { GA4_PROPERTY_ISL: "111" }, { ga4_property_isl: "222" })
    ).toBe("111");
  });

  it("falls back to the database when the environment is unset", () => {
    expect(resolvePropertyId(brand, {}, { ga4_property_isl: "222" })).toBe("222");
  });

  // An empty string is how an unset secret usually arrives, and treating it as
  // a real value would skip the brand instead of falling through.
  it("treats a blank environment value as unset", () => {
    expect(
      resolvePropertyId(brand, { GA4_PROPERTY_ISL: "   " }, { ga4_property_isl: "222" })
    ).toBe("222");
  });

  it("trims whitespace, which a pasted value usually carries", () => {
    expect(resolvePropertyId(brand, {}, { ga4_property_isl: " 385963889\n" })).toBe("385963889");
  });

  // The caller skips the brand rather than querying GA4 with a null property.
  it("returns null when neither source has it", () => {
    expect(resolvePropertyId(brand, {}, {})).toBeNull();
  });
});
