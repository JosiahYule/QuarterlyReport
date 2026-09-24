// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaidPage } from "./PaidPage.jsx";
import { usePaidReport } from "../hooks/usePaidReport.js";
import { sumPaidMediaAds } from "../utils.js";
import { QUARTERS } from "../config.js";

vi.mock("../hooks/usePaidReport.js", () => ({ usePaidReport: vi.fn() }));
vi.mock("../hooks/usePublishedQuarters.js", () => ({ usePublishedQuarters: vi.fn(() => []) }));

const ad = (over) => ({
  id: "ad-1",
  name: "Ad one",
  impressions: 10000,
  reach: 7000,
  clicks: 300,
  conversions: 12,
  cpc: 1.25,
  engagementRate: 2.4,
  status: "active",
  ...over,
});

function campaign(over = {}) {
  const ads = over.ads ?? [ad()];
  return {
    id: "c1",
    name: "Skilled trades Q4",
    objective: "Applications",
    platform: "LinkedIn",
    budget: 2000,
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    audience: [],
    clickPaths: [],
    ...over,
    ads,
    totals: sumPaidMediaAds(ads),
  };
}

function report(over = {}) {
  const campaigns = over.campaigns ?? [campaign()];
  const audience = over.audience ?? [];
  const clickPaths = over.clickPaths ?? [];
  return {
    meta: {
      quarter: "Q4",
      rangeLabel: "Jun – Aug 2026",
      year: 2026,
      agencyName: "Integrated Staffing",
    },
    campaigns,
    totals: sumPaidMediaAds(campaigns.flatMap((c) => c.ads)),
    platforms: [...new Set(campaigns.map((c) => c.platform).filter(Boolean))],
    audience,
    clickPaths,
    hasData: campaigns.length > 0 || audience.length > 0 || clickPaths.length > 0,
    ...over,
  };
}

function mockPaid(state) {
  usePaidReport.mockReturnValue({ data: null, status: "loading", error: null, ...state });
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

const page = (extra) => render(<PaidPage agency="isl" quarter={QUARTERS[1].id} {...extra} />);
/** The per-campaign disclosure buttons, in document order. */
const toggles = () => [...document.querySelectorAll("button.campaign-toggle")];

describe("PaidPage states", () => {
  it("shows the campaign-shaped skeleton, not the KPI grid", () => {
    mockPaid({ status: "loading" });
    const { container } = page();
    expect(screen.getByRole("progressbar", { name: "Loading page content" })).toBeTruthy();
    expect(container.querySelector(".kpi-grid")).toBeNull();
  });

  it("surfaces a fetch error with a working retry", () => {
    mockPaid({ status: "error", error: "Paid data unavailable." });
    page();
    expect(screen.getByRole("alert").textContent).toContain("Paid data unavailable.");

    const keyBefore = usePaidReport.mock.calls.at(-1)[2];
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(usePaidReport.mock.calls.at(-1)[2]).toBe(keyBefore + 1);
  });

  it("distinguishes an unpublished quarter from a failure", () => {
    mockPaid({ status: "ready", data: null });
    page();
    expect(screen.getByText(/There’s no Paid Media report for/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells the shell it has settled once ready", () => {
    mockPaid({ status: "ready", data: report() });
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).toHaveBeenCalled();
  });
});

describe("PaidPage with no campaigns run", () => {
  it("still renders the hero rather than an error", () => {
    mockPaid({ status: "ready", data: report({ campaigns: [], hasData: false }) });
    page();
    expect(screen.getByText("Integrated Staffing")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows no campaign section at all", () => {
    mockPaid({ status: "ready", data: report({ campaigns: [], hasData: false }) });
    const { container } = page();
    expect(container.querySelector(".paid-media-campaigns")).toBeNull();
  });
});

describe("PaidPage campaign expand and collapse", () => {
  const two = () => [campaign(), campaign({ id: "c2", name: "Office admin Q4" })];

  it("opens the first campaign by default, so the page is not a wall of closed rows", () => {
    mockPaid({ status: "ready", data: report({ campaigns: two() }) });
    page();
    const [first, second] = toggles();
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens a closed campaign when its header is clicked", () => {
    mockPaid({ status: "ready", data: report({ campaigns: two() }) });
    page();
    fireEvent.click(toggles()[1]);
    expect(toggles()[1].getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the open one when clicked again", () => {
    mockPaid({ status: "ready", data: report({ campaigns: two() }) });
    page();
    fireEvent.click(toggles()[0]);
    expect(toggles()[0].getAttribute("aria-expanded")).toBe("false");
  });

  it("offers expand-all only when there is more than one campaign", () => {
    mockPaid({ status: "ready", data: report({ campaigns: [campaign()] }) });
    page();
    expect(screen.queryByRole("button", { name: /Expand all|Collapse all/ })).toBeNull();
  });

  it("expands every campaign at once", () => {
    mockPaid({ status: "ready", data: report({ campaigns: two() }) });
    page();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(toggles().every((t) => t.getAttribute("aria-expanded") === "true")).toBe(true);
  });

  it("flips to collapse-all once everything is open, and collapses everything", () => {
    mockPaid({ status: "ready", data: report({ campaigns: two() }) });
    page();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(toggles().every((t) => t.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("resets which campaigns are open when the quarter changes", () => {
    mockPaid({ status: "ready", data: report({ campaigns: two() }) });
    const { rerender } = render(<PaidPage agency="isl" quarter={QUARTERS[1].id} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(toggles().every((t) => t.getAttribute("aria-expanded") === "true")).toBe(true);

    // The campaign ids underneath are different in another quarter, so the
    // open set has to fall back to the default rather than persist.
    rerender(<PaidPage agency="isl" quarter={QUARTERS[2].id} />);
    const [first, second] = toggles();
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("PaidPage campaign content", () => {
  beforeEach(() => mockPaid({ status: "ready", data: report() }));

  it("names the campaign and its platform", () => {
    page();
    expect(screen.getByText("Skilled trades Q4")).toBeTruthy();
    expect(screen.getAllByText(/LinkedIn/).length).toBeGreaterThan(0);
  });

  it("derives spend from cpc times clicks rather than expecting a stored figure", () => {
    page();
    // 300 clicks at $1.25 = $375
    expect(screen.getAllByText(/\$375/).length).toBeGreaterThan(0);
  });

  it("survives a campaign whose ads carry no figures at all", () => {
    mockPaid({
      status: "ready",
      data: report({
        campaigns: [
          campaign({
            ads: [ad({ impressions: null, clicks: null, cpc: null, conversions: null, reach: null })],
          }),
        ],
      }),
    });
    expect(() => page()).not.toThrow();
  });

  it("survives a campaign with no ads at all", () => {
    mockPaid({ status: "ready", data: report({ campaigns: [campaign({ ads: [] })] }) });
    expect(() => page()).not.toThrow();
  });
});

describe("PaidPage account-wide sections", () => {
  it("hides the account audience section when there is none", () => {
    mockPaid({ status: "ready", data: report() });
    const { container } = page();
    expect(container.querySelector("#audience")).toBeNull();
  });

  it("hides the click-paths section when there are none", () => {
    mockPaid({ status: "ready", data: report() });
    const { container } = page();
    expect(container.querySelector("#click-paths")).toBeNull();
  });

  it("shows the click-paths section when the account has journeys", () => {
    mockPaid({
      status: "ready",
      data: report({
        clickPaths: [{ steps: ["/", "/jobs"], sessions: 40 }],
      }),
    });
    const { container } = page();
    expect(container.querySelector("#click-paths")).toBeTruthy();
  });
});
