// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TrendsPage } from "./TrendsPage.jsx";
import { useTrendsData } from "../hooks/useTrendsData.js";

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
