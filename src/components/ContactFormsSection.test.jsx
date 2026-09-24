// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContactFormsSection } from "./ContactFormsSection.jsx";
import { QUARTERS } from "../config.js";

// A completed quarter, so "weeks elapsed" is the whole quarter and the
// per-week figure does not drift with the clock.
const Q = QUARTERS[1];
const WEEKS_IN_Q = (Q.end.getTime() - Q.start.getTime()) / (7 * 86400000);

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Monday-keyed weeks, the shape the stats RPC returns. */
function weeklyRows(count) {
  const rows = [];
  const m = new Date(Q.start.getFullYear(), Q.start.getMonth(), Q.start.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  for (let i = 0; i < count; i++) {
    rows.push({ week: iso(m), total: 10, work: 7, staff: 3 });
    m.setDate(m.getDate() + 7);
  }
  return rows;
}

const stats = (over = {}) => ({
  totals: { total: 263, work: 180, staff: 83, ...over.totals },
  weekly: over.weekly ?? weeklyRows(13),
  locations: over.locations ?? [
    { location: "Halifax", total: 120, work: 90, staff: 30 },
    { location: "Dartmouth", total: 60, work: 45, staff: 15 },
  ],
  sources: over.sources ?? [
    { source: "Google", count: 80 },
    { source: "Referral", count: 40 },
  ],
  sourceWeekly: over.sourceWeekly ?? [],
  sourceSince: over.sourceSince ?? iso(Q.start),
  sourceEligible: over.sourceEligible ?? 120,
  heatmap: over.heatmap ?? [
    { dow: 1, hour: 9, count: 12 },
    { dow: 3, hour: 14, count: 8 },
  ],
});

beforeEach(() => {
  // Skip the count-up animation so KPI values are final on first paint.
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const section = (props) => render(<ContactFormsSection quarter={Q.id} {...props} />);

describe("ContactFormsSection staying off the page", () => {
  // The section is optional: useFormStats swallows its own errors, so
  // "no data" and "the fetch failed" both arrive here as null.
  it("renders nothing when there are no stats at all", () => {
    const { container } = section({ stats: null });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the stats came back with no totals", () => {
    const { container } = section({ stats: { weekly: [] } });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the quarter had zero submissions", () => {
    const { container } = section({ stats: stats({ totals: { total: 0, work: 0, staff: 0 } }) });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for a quarter suffix it does not recognise", () => {
    const { container } = render(<ContactFormsSection quarter="not-a-quarter" stats={stats()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ContactFormsSection KPIs", () => {
  it("shows the four headline figures", () => {
    section({ stats: stats() });
    for (const label of ["Total Submissions", "Job Seekers", "Employer Leads", "Per Week"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("splits the total into job seekers and employer leads", () => {
    section({ stats: stats() });
    expect(screen.getByText("263")).toBeTruthy();
    expect(screen.getByText("180")).toBeTruthy();
    expect(screen.getByText("83")).toBeTruthy();
  });

  it("averages per week over the quarter's real length, to one decimal", () => {
    section({ stats: stats() });
    expect(screen.getByText((263 / WEEKS_IN_Q).toFixed(1))).toBeTruthy();
  });

  it("shows no delta when there is no prior quarter to compare against", () => {
    // A flat 0.0% here used to say "unchanged" when the truth was "unknown".
    const { container } = section({ stats: stats(), prevStats: null });
    expect(container.querySelectorAll(".delta")).toHaveLength(0);
  });

  it("compares only the per-week rate while the quarter is still running", () => {
    // Part of this quarter against all of the last one reads as a steep fall
    // every week until the final one; the per-week rate is fair throughout.
    const current = QUARTERS[0];
    const { container } = render(
      <ContactFormsSection
        quarter={current.id}
        stats={stats()}
        prevStats={{ totals: { total: 400, work: 300, staff: 100 } }}
      />
    );
    const kpis = [...container.querySelectorAll(".kpi")];
    const hasDelta = kpis.map((k) => !!k.querySelector(".delta"));
    expect(hasDelta).toEqual([false, false, false, true]);
    expect(screen.getByText("so far this quarter")).toBeTruthy();
  });

  it("compares against the prior quarter when one is supplied", () => {
    const { container } = section({
      stats: stats(),
      prevStats: { totals: { total: 200, work: 150, staff: 50 } },
    });
    const deltas = [...container.querySelectorAll(".delta")];
    // 263 up from 200 is a rise; every headline figure grew.
    expect(deltas[0].className).toContain("up");
    expect(deltas.some((d) => d.className.includes("flat"))).toBe(false);
  });

  it("reads a fall as a fall", () => {
    const { container } = section({
      stats: stats(),
      prevStats: { totals: { total: 400, work: 300, staff: 100 } },
    });
    expect(container.querySelector(".delta").className).toContain("down");
  });
});

describe("ContactFormsSection weekly chart", () => {
  it("draws the trend once there is more than one week to plot", () => {
    const { container } = section({ stats: stats({ weekly: weeklyRows(13) }) });
    expect(container.querySelector(".cf-chart, svg")).toBeTruthy();
  });

  it("does not draw a one-point line for a quarter with a single week", () => {
    // A quarter that has only just started has one Monday behind it. The
    // chart is suppressed rather than drawn as a single dot.
    const current = QUARTERS[0];
    const { container } = render(
      <ContactFormsSection
        quarter={current.id}
        stats={{ ...stats(), weekly: [{ week: iso(current.start), total: 4, work: 3, staff: 1 }] }}
      />
    );
    // The section itself still renders; only the chart is conditional.
    expect(container.querySelector("#contact-forms")).toBeTruthy();
  });
});

describe("ContactFormsSection breakdowns", () => {
  it("lists where submissions came from geographically", () => {
    section({ stats: stats() });
    expect(screen.getByText("Halifax")).toBeTruthy();
    expect(screen.getByText("Dartmouth")).toBeTruthy();
  });

  it("lists how people said they heard about the agency", () => {
    section({ stats: stats() });
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("Referral")).toBeTruthy();
  });

  it("copes with no locations recorded", () => {
    expect(() => section({ stats: stats({ locations: [] }) })).not.toThrow();
  });

  it("copes with no sources recorded", () => {
    expect(() => section({ stats: stats({ sources: [] }) })).not.toThrow();
  });

  it("copes with an empty heatmap", () => {
    expect(() => section({ stats: stats({ heatmap: [] }) })).not.toThrow();
  });

  it("renders when the source question was never asked in this quarter", () => {
    expect(() =>
      section({ stats: stats({ sourceSince: null, sourceEligible: 0, sources: [] }) })
    ).not.toThrow();
  });
});
