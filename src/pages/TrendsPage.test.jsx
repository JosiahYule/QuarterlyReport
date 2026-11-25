// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TrendsPage } from "./TrendsPage.jsx";
import { useTrendsData } from "../hooks/useTrendsData.js";
import { TRENDS_QUARTERS, TRENDS_YOY_QUARTER } from "../config.js";

// Chart.js needs a real 2d canvas context, which jsdom does not provide.
// The charts are not what these tests are about, so stand in a no-op.
vi.mock("chart.js/auto", () => ({
  default: class {
    constructor(_ctx, config = {}) {
      // The page mutates chart.data.labels / datasets and calls update(),
      // so the stub has to carry the same shape a real Chart exposes.
      this.config = config;
      this.data = config.data ?? { labels: [], datasets: [] };
      this.options = config.options ?? {};
      this.canvas = null;
    }
    update() {}
    destroy() {}
    resize() {}
    getElementsAtEventForMode() {
      return [];
    }
  },
}));

// Keep every pure helper the page imports from this module — they are the
// real projection maths and already have their own tests — and replace only
// the data hook.
vi.mock("../hooks/useTrendsData.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useTrendsData: vi.fn(),
}));

const quarter = (over) => ({
  overall: {
    posts: 40,
    impressions: 60000,
    shares: 200,
    reactions: 1200,
    followers: 5000,
    linkclicks: 500,
    comments: 60,
    ...over,
  },
});

// Oldest to newest, matching TRENDS_QUARTERS.
const QDATA = [
  quarter({ impressions: 40000, followers: 4600 }),
  quarter({ impressions: 52000, followers: 4900 }),
  quarter({ impressions: 61000, followers: 5300 }),
];

function mockTrends(state) {
  useTrendsData.mockReturnValue({
    qdata: null,
    snapsByQuarter: {},
    calibrationHistory: {},
    yoyData: null,
    paidByQuarter: {},
    drivers: null,
    platforms: [],
    status: "loading",
    error: null,
    ...state,
  });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
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

const page = (extra) => render(<TrendsPage agency="isl" {...extra} />);

describe("TrendsPage while loading", () => {
  it("shows the loading skeleton", () => {
    mockTrends({ status: "loading" });
    page();
    expect(screen.getByRole("progressbar", { name: "Loading page content" })).toBeTruthy();
  });

  it("keeps waiting when the status says ready but no data arrived", () => {
    // Unlike the report pages, Trends has no "unpublished quarter" state —
    // it spans quarters, so missing data means keep showing the skeleton.
    mockTrends({ status: "ready", qdata: null });
    page();
    expect(screen.getByRole("progressbar", { name: "Loading page content" })).toBeTruthy();
  });

  it("does not report ready to the shell while still loading", () => {
    mockTrends({ status: "loading" });
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("TrendsPage when the fetch fails", () => {
  beforeEach(() => mockTrends({ status: "error", error: "Trends are unavailable." }));

  it("shows the error as an alert", () => {
    page();
    expect(screen.getByRole("alert").textContent).toContain("Trends are unavailable.");
  });

  it("offers a retry", () => {
    page();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("retries by reloading, since this page has no retry key to bump", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    page();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still tells the shell it has settled", () => {
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).toHaveBeenCalled();
  });
});

describe("TrendsPage with data", () => {
  beforeEach(() => mockTrends({ status: "ready", qdata: QDATA }));

  it("renders the report rather than the skeleton", () => {
    page();
    expect(screen.queryByRole("progressbar", { name: "Loading page content" })).toBeNull();
    expect(document.querySelector("main.report-wrap")).toBeTruthy();
  });

  it("tells the shell it is ready", () => {
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).toHaveBeenCalled();
  });

  it("renders without a chart library available, so a canvas failure cannot blank the page", () => {
    const { container } = page();
    expect(container.textContent.length).toBeGreaterThan(0);
  });

  it("survives a quarter with no report at all", () => {
    mockTrends({ status: "ready", qdata: [null, QDATA[1], QDATA[2]] });
    expect(() => page()).not.toThrow();
  });

  it("survives every metric being absent", () => {
    mockTrends({ status: "ready", qdata: [quarter({}), quarter({}), { overall: {} }] });
    expect(() => page()).not.toThrow();
  });

  it("passes the agency straight through to the hook", () => {
    render(<TrendsPage agency="ads" />);
    expect(useTrendsData).toHaveBeenCalledWith("ads");
  });
});

describe("TrendsPage year over year and paid campaigns", () => {
  const [, tq2, tq3] = TRENDS_QUARTERS;
  const yoyTitle = TRENDS_YOY_QUARTER.title;
  const key = (q) => `${q.suffix}-${q.year}`;
  const dated = {
    name: "Summer Brand Awareness",
    platform: "LinkedIn",
    budget: 500,
    start: new Date(tq2.start.getFullYear(), tq2.start.getMonth(), 2),
    end: new Date(tq2.start.getFullYear(), tq2.start.getMonth(), 24),
    undated: false,
  };
  const undated = {
    name: "Perm Lead Gen",
    platform: "LinkedIn",
    budget: 500,
    start: null,
    end: null,
    undated: true,
  };
  // Two snapshots so the trajectory section (which carries the paid note) renders.
  const snaps = [
    { t: tq3.start.getTime() + 10 * 86400000, vals: { impressions: 20000 } },
    { t: tq3.start.getTime() + 11 * 86400000, vals: { impressions: 21000 } },
  ];

  it("adds a row comparing each card with the same quarter last year", () => {
    mockTrends({ status: "ready", qdata: QDATA, yoyData: quarter({ impressions: 50000 }) });
    page();
    const card = [...document.querySelectorAll(".proj-card")].find(
      (c) => c.querySelector(".proj-card-label")?.textContent === "Impressions"
    );
    const stat = [...card.querySelectorAll(".proj-stat")].find(
      (s) => s.querySelector(".proj-stat-label").textContent === `vs ${yoyTitle}`
    );
    const value = stat.querySelector(".proj-stat-value");
    // Compared on the headline's basis, the projected final, which can't be
    // below the 61,000 banked: so at least +22% on last year's 50,000.
    expect(value.textContent).toMatch(/^\+\d+\.\d%$/);
    expect(parseFloat(value.textContent.slice(1))).toBeGreaterThanOrEqual(22);
    expect(value.className).toContain("pos");
  });

  it("compares followers on total audience and says so", () => {
    mockTrends({ status: "ready", qdata: QDATA, yoyData: quarter({ followers: 5000 }) });
    page();
    expect(screen.getByText(`Total vs ${yoyTitle}`)).toBeTruthy();
    expect(screen.getAllByText("+6.0%").length).toBeGreaterThan(0); // 5,300 vs 5,000
  });

  it("leaves the row out when there is no report for last year", () => {
    mockTrends({ status: "ready", qdata: QDATA, yoyData: null });
    page();
    expect(screen.queryByText(`vs ${yoyTitle}`)).toBeNull();
  });

  it("puts last year's bar on the quarterly chart and tags quarters with paid campaigns", () => {
    mockTrends({
      status: "ready",
      qdata: QDATA,
      yoyData: quarter({ impressions: 50000 }),
      paidByQuarter: { [key(tq2)]: [dated] },
    });
    page();
    const chart = screen.getByRole("img", { name: /^Impressions:/ });
    const label = chart.getAttribute("aria-label");
    expect(label).toContain(yoyTitle);
    expect(label).toContain(`${tq2.label} · ${tq2.months} · paid campaign`);
    expect(label).not.toContain(`${tq3.label} · ${tq3.months} · paid campaign`);
  });

  it("names this quarter's paid campaigns under the trajectory, saying when dates are missing", () => {
    mockTrends({
      status: "ready",
      qdata: QDATA,
      snapsByQuarter: { [tq3.suffix]: snaps },
      paidByQuarter: { [key(tq3)]: [undated] },
    });
    page();
    expect(screen.getByText("Paid this quarter")).toBeTruthy();
    expect(screen.getByText("Perm Lead Gen")).toBeTruthy();
    expect(document.querySelector(".trajectory-paid-note").textContent).toContain(
      "dates not recorded, so not shaded"
    );
  });

  it("shows no paid note in a quarter without paid campaigns", () => {
    mockTrends({ status: "ready", qdata: QDATA, snapsByQuarter: { [tq3.suffix]: snaps } });
    page();
    expect(screen.queryByText("Paid this quarter")).toBeNull();
  });
});
