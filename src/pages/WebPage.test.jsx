// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const QUARTER = QUARTERS[0].suffix;

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
  deltas: {},
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
    expect(screen.getByText(`${q.label} (${q.rangeLabel})`)).toBeTruthy();
  });

  it("links to the quarters that do have a report", () => {
    usePublishedQuarters.mockReturnValue([QUARTERS[1], QUARTERS[2]]);
    mockReport({ status: "ready", data: null });
    page();
    const link = screen.getByRole("link", {
      name: `${QUARTERS[1].label} · ${QUARTERS[1].rangeLabel}`,
    });
    expect(link.getAttribute("href")).toBe(`?agency=isl&quarter=${QUARTERS[1].suffix}&view=web`);
  });

  // The quarter already on screen is the one with nothing in it, so offering
  // it as an escape route would be a link back to the same empty page.
  it("does not offer the quarter already being viewed", () => {
    usePublishedQuarters.mockReturnValue([QUARTERS[0], QUARTERS[1]]);
    mockReport({ status: "ready", data: null });
    page();
    expect(
      screen.queryByRole("link", { name: `${QUARTERS[0].label} · ${QUARTERS[0].rangeLabel}` })
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
    const idx = [...container.querySelectorAll(".channel-idx")].map((el) => el.textContent);
    expect(idx).toEqual(["01", "02"]);
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
