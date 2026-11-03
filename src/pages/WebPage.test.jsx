// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WebPage } from "./WebPage.jsx";
import { useWebReport } from "../hooks/useWebReport.js";
import { useFormStats } from "../hooks/useFormStats.js";
import { usePublishedQuarters } from "../hooks/usePublishedQuarters.js";
import { QUARTERS } from "../config.js";

// The page's job is to turn hook state into a screen. Mock the data layer so
// each of its four states — loading, error, published-but-empty, and ready —
// can be driven directly.
vi.mock("../hooks/useWebReport.js", () => ({ useWebReport: vi.fn() }));
vi.mock("../hooks/useFormStats.js", () => ({ useFormStats: vi.fn() }));
vi.mock("../hooks/usePublishedQuarters.js", () => ({ usePublishedQuarters: vi.fn(() => []) }));

const QUARTER = QUARTERS[0].id;

const REPORT = {
  summary: { bullet: "Traffic grew on the back of the careers page." },
  overall: {
    sessions: 12400,
    users: 9100,
    engagementRate: 61.4,
    avgEngagementTimeSec: 125,
    actions: 340,
    formSubmissions: 86,
  },
  channels: [
    { name: "Organic", sessions: 7000, shareOfTraffic: 56.5, engagementRate: 64.2 },
    { name: "Direct", sessions: 3200, shareOfTraffic: 25.8, engagementRate: 58.1 },
  ],
  topPages: [{ key: "/jobs", pageViews: 4300, bounceRate: 38.2, avgTimeOnPageSec: 95 }],
  insights: { working: "Careers page.", notWorking: "", actions: "", next: "" },
};

function mockReport(state) {
  useWebReport.mockReturnValue({ data: null, prevData: null, status: "loading", error: null, ...state });
}

beforeEach(() => {
  useFormStats.mockReturnValue({ stats: null, prevStats: null });
  // clearAllMocks keeps implementations, so a mockReturnValue set by one test
  // would otherwise carry into the next. Reset the default explicitly.
  usePublishedQuarters.mockReturnValue([]);
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
  vi.clearAllMocks();
});

const page = (extra) => render(<WebPage agency="isl" quarter={QUARTER} {...extra} />);

describe("WebPage while loading", () => {
  it("shows a progress bar and a skeleton, not an empty screen", () => {
    mockReport({ status: "loading" });
    page();
    expect(screen.getByRole("progressbar", { name: "Loading page content" })).toBeTruthy();
  });

  it("shapes the skeleton for the web view's six-KPI grid", () => {
    mockReport({ status: "loading" });
    const { container } = page();
    expect(container.querySelectorAll(".kpi-grid > div")).toHaveLength(6);
  });

  it("does not tell the shell it is ready yet", () => {
    mockReport({ status: "loading" });
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("WebPage when the fetch fails", () => {
  it("shows the error message it was given, as an alert", () => {
    mockReport({ status: "error", error: "Network unreachable." });
    page();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Network unreachable.");
  });

  it("offers a retry that re-runs the hook with a new key", () => {
    mockReport({ status: "error", error: "Network unreachable." });
    page();
    const keyBefore = useWebReport.mock.calls.at(-1)[2];
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(useWebReport.mock.calls.at(-1)[2]).toBe(keyBefore + 1);
  });

  it("still tells the shell it has settled, so the app stops waiting", () => {
    mockReport({ status: "error", error: "Network unreachable." });
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).toHaveBeenCalled();
  });
});

describe("WebPage when the quarter has no published report", () => {
  it("says so plainly rather than showing an error", () => {
    mockReport({ status: "ready", data: null });
    page();
    expect(screen.getByText(/There’s no Website report for/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Naming the quarter is what tells the reader they are looking somewhere
  // other than where they just entered their numbers. "The selected quarter"
  // reads as a fault in the report; the quarter's own label does not.
  it("names the quarter it found nothing for", () => {
    mockReport({ status: "ready", data: null });
    page();
    const q = QUARTERS[0];
    expect(screen.getByText(`${q.title} (${q.rangeLabel})`)).toBeTruthy();
  });

  it("links to the quarters that do have a report", () => {
    usePublishedQuarters.mockReturnValue([QUARTERS[1], QUARTERS[2]]);
    mockReport({ status: "ready", data: null });
    page();
    const link = screen.getByRole("link", {
      name: `${QUARTERS[1].title} · ${QUARTERS[1].rangeLabel}`,
    });
    expect(link.getAttribute("href")).toBe(`?agency=isl&quarter=${QUARTERS[1].id}&view=web`);
  });

  // The quarter already on screen is the one with nothing in it, so offering
  // it as an escape route would be a link back to the same empty page.
  it("does not offer the quarter already being viewed", () => {
    usePublishedQuarters.mockReturnValue([QUARTERS[0], QUARTERS[1]]);
    mockReport({ status: "ready", data: null });
    page();
    expect(
      screen.queryByRole("link", { name: `${QUARTERS[0].title} · ${QUARTERS[0].rangeLabel}` })
    ).toBeNull();
  });

  // The list is a convenience, not a requirement: the lookup fails quiet, and
  // the page must still explain itself when it comes back empty.
  it("still explains itself when no other quarter has data", () => {
    usePublishedQuarters.mockReturnValue([]);
    mockReport({ status: "ready", data: null });
    page();
    expect(screen.getByText(/There’s no Website report for/)).toBeTruthy();
    expect(screen.queryByText("Published quarters:")).toBeNull();
  });
});

describe("WebPage with a published report", () => {
  beforeEach(() => mockReport({ status: "ready", data: REPORT }));

  it("leads with the summary the editor wrote", () => {
    page();
    expect(screen.getByText(REPORT.summary.bullet)).toBeTruthy();
  });

  it("falls back to a generic line when no summary was written", () => {
    mockReport({ status: "ready", data: { ...REPORT, summary: { bullet: "   " } } });
    page();
    expect(screen.getByText("Website performance report for Integrated Staffing.")).toBeTruthy();
  });

  it("renders all six KPIs with their values formatted", () => {
    const { container } = page();
    expect(container.querySelectorAll(".kpi")).toHaveLength(6);
    expect(screen.getByText("12,400")).toBeTruthy(); // sessions, fmtInt
    expect(screen.getByText("61.4%")).toBeTruthy(); // engagement rate, fmtPct
    expect(screen.getByText("2:05")).toBeTruthy(); // avg time, fmtTime
  });

  it("lists the traffic channels in the order given", () => {
    page();
    const rows = screen.getAllByRole("row");
    // First row is the header.
    expect(rows[1].textContent).toContain("Organic");
    expect(rows[2].textContent).toContain("Direct");
  });

  it("numbers the channels for scanning", () => {
    const { container } = page();
    const table = container.querySelector('[aria-label="Traffic channels breakdown"]');
    const idx = [...table.querySelectorAll(".channel-idx")].map((el) => el.textContent);
    expect(idx).toEqual(["01", "02"]);
  });

  it("lists top pages as a ranked table with their three figures", () => {
    page();
    const table = screen.getByRole("table", { name: "Top pages by page views" });
    expect(within(table).getByRole("rowheader", { name: "/jobs" })).toBeTruthy();
    expect(within(table).getByText("4,300")).toBeTruthy();
    expect(within(table).getByText("1:35")).toBeTruthy();
  });

  it("shows an empty note for each insight section left blank", () => {
    page();
    // working has text; the other three are blank.
    expect(screen.getAllByText("No notes yet.")).toHaveLength(3);
    expect(screen.getByText("Careers page.")).toBeTruthy();
  });

  it("splits a multi-paragraph insight into separate points", () => {
    mockReport({
      status: "ready",
      data: { ...REPORT, insights: { ...REPORT.insights, next: "Publish more.\n\nFix the form." } },
    });
    page();
    expect(screen.getByText("Publish more.")).toBeTruthy();
    expect(screen.getByText("Fix the form.")).toBeTruthy();
  });

  it("tells the shell it is ready", () => {
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).toHaveBeenCalled();
  });

  it("survives a section throwing, showing the rest of the report", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // A channel with no name is enough to break that section's key handling.
    mockReport({ status: "ready", data: { ...REPORT, channels: null, topPages: null } });
    page();
    // The hero still renders even though other sections had nothing to work with.
    expect(screen.getByText(REPORT.summary.bullet)).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("WebPage contact forms section", () => {
  it("keeps Contact Forms out of the section rail until there are submissions", () => {
    mockReport({ status: "ready", data: REPORT });
    useFormStats.mockReturnValue({ stats: { totals: { total: 0 } }, prevStats: null });
    page();
    expect(screen.queryByRole("button", { name: "Contact Forms" })).toBeNull();
  });
});

describe("WebPage part way through a quarter", () => {
  // Figures saved halfway through, against a full previous quarter.
  const partial = { complete: false, fraction: 0.5, asOf: new Date("2026-10-16T15:00:00Z"), days: 91 };
  const PREV = {
    ...REPORT,
    overall: { ...REPORT.overall, sessions: 20000, users: 16000, engagementRate: 60 },
    channels: [{ name: "Organic", sessions: 12000, shareOfTraffic: 55, engagementRate: 60 }],
  };
  const kpi = (container, label) =>
    [...container.querySelectorAll("#numbers .kpi")].find((k) => k.textContent.includes(label));

  it("says the quarter is in progress, how far, and to when", () => {
    mockReport({ status: "ready", data: { ...REPORT, coverage: partial }, prevData: PREV });
    page();
    expect(screen.getByText(/In progress · figures to Oct\.? 16 · 50% of the quarter/)).toBeTruthy();
  });

  it("compares a total at its pace, and says so", () => {
    mockReport({ status: "ready", data: { ...REPORT, coverage: partial }, prevData: PREV });
    const { container } = page();
    // 12,400 by halfway is on pace for 24,800: up 24%, not down 38%.
    const visits = kpi(container, "Total Visits");
    expect(visits.textContent).toContain("on pace for 24,800");
    expect(visits.querySelector(".delta").textContent).toBe("+24.0%");
  });

  it("gives unique users no comparison, since distinct people don't add up by the day", () => {
    mockReport({ status: "ready", data: { ...REPORT, coverage: partial }, prevData: PREV });
    const { container } = page();
    const users = kpi(container, "Unique Users");
    expect(users.querySelector(".delta")).toBeNull();
    expect(users.textContent).toContain("so far this quarter");
  });

  it("still compares a rate as it stands", () => {
    mockReport({ status: "ready", data: { ...REPORT, coverage: partial }, prevData: PREV });
    const { container } = page();
    expect(kpi(container, "Engagement Rate").querySelector(".delta")).toBeTruthy();
  });

  it("drops raw totals from the channel table but keeps its rates", () => {
    mockReport({ status: "ready", data: { ...REPORT, coverage: partial }, prevData: PREV });
    const { container } = page();
    const organic = [...container.querySelectorAll("#channels [role='row']")].find((r) =>
      r.textContent.includes("Organic")
    );
    expect(organic.querySelector("[data-label='Sessions'] .delta")).toBeNull();
    expect(organic.querySelector("[data-label='Share'] .delta")).toBeTruthy();
  });

  it("shows no progress line for a finished quarter", () => {
    mockReport({
      status: "ready",
      data: { ...REPORT, coverage: { complete: true, fraction: 1 } },
      prevData: PREV,
    });
    page();
    expect(screen.queryByText(/In progress/)).toBeNull();
  });
});
