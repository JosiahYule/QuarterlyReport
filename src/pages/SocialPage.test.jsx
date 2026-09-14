// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SocialPage } from "./SocialPage.jsx";
import { useSocialReport } from "../hooks/useSocialReport.js";
import { useSocialKpiHistory } from "../hooks/useSocialKpiHistory.js";

vi.mock("../hooks/useSocialReport.js", () => ({ useSocialReport: vi.fn() }));
vi.mock("../hooks/useSocialKpiHistory.js", () => ({ useSocialKpiHistory: vi.fn() }));

const post = (over) => ({
  "Post Name": "A post",
  Date: "2026-06-15",
  Platforms: "LinkedIn",
  Impressions: 1000,
  Engagements: 50,
  URL: "",
  Notes: "",
  ...over,
});

const REPORT = {
  meta: {
    quarter: "Q4",
    rangeLabel: "Jun – Aug 2026",
    year: 2026,
    agencyName: "Integrated Staffing",
  },
  editorsNote: "A strong quarter for hiring content.",
  overall: {
    posts: 42,
    impressions: 128000,
    shares: 310,
    reactions: 1450,
    followers: 5542,
    linkclicks: 620,
    comments: 88,
    avgengagementrate: 4.267,
  },
  deltas: {},
  platforms: [
    {
      key: "linkedin",
      name: "LinkedIn",
      followers: 3100,
      engagementRate: 5.2,
      pageReach: 40000,
      pageClicks: 300,
      note: "",
    },
    {
      key: "facebook",
      name: "Facebook",
      followers: 2442,
      engagementRate: 2.1,
      pageReach: 18000,
      pageClicks: 120,
      note: "",
    },
  ],
  topPostsByPlatform: {
    linkedin: [{ title: "Hiring in Halifax", impressions: 9000, likes: 120, shares: 14 }],
    facebook: [],
    instagram: [],
  },
  notes: { working: ["Job posts."], notWorking: [], actions: [], next: [] },
  allPosts: [
    post({
      "Post Name": "Welder wanted",
      Date: "2026-06-01",
      Platforms: "LinkedIn",
      Impressions: 2000,
      Engagements: 40,
    }),
    post({
      "Post Name": "Office admin role",
      Date: "2026-07-10",
      Platforms: "Facebook",
      Impressions: 1000,
      Engagements: 90,
    }),
    post({
      "Post Name": "Team photo",
      Date: "2026-08-20",
      Platforms: "Instagram",
      Impressions: 500,
      Engagements: 10,
      Notes: "behind the scenes",
    }),
  ],
  weekly: Array.from({ length: 13 }, (_, i) => ({ wk: i + 1, imp: 0, leads: 0, spend: 0 })),
};

function mockReport(state) {
  useSocialReport.mockReturnValue({ data: null, status: "loading", error: null, ...state });
}

beforeEach(() => {
  useSocialKpiHistory.mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
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

const page = (extra) => render(<SocialPage agency="isl" quarter="q4" {...extra} />);
const postCount = () => screen.getByText(/\d+ posts/).textContent;

describe("SocialPage states", () => {
  it("shows the eight-KPI social skeleton while loading", () => {
    mockReport({ status: "loading" });
    const { container } = page();
    expect(screen.getByRole("progressbar", { name: "Loading page content" })).toBeTruthy();
    expect(container.querySelectorAll(".kpi-grid > div")).toHaveLength(8);
  });

  it("surfaces a fetch error as an alert with a retry", () => {
    mockReport({ status: "error", error: "Connection lost." });
    page();
    expect(screen.getByRole("alert").textContent).toContain("Connection lost.");

    const keyBefore = useSocialReport.mock.calls.at(-1)[2];
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(useSocialReport.mock.calls.at(-1)[2]).toBe(keyBefore + 1);
  });

  it("distinguishes an unpublished quarter from a failure", () => {
    mockReport({ status: "ready", data: null });
    page();
    expect(screen.getByText(/hasn’t been published for the selected quarter/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells the shell it has settled once ready", () => {
    mockReport({ status: "ready", data: REPORT });
    const onReady = vi.fn();
    page({ onReady });
    expect(onReady).toHaveBeenCalled();
  });
});

describe("SocialPage hero and KPIs", () => {
  beforeEach(() => mockReport({ status: "ready", data: REPORT }));

  it("names the quarter, agency and date range", () => {
    page();
    expect(screen.getByText("Q4")).toBeTruthy();
    expect(screen.getByText("Integrated Staffing")).toBeTruthy();
    expect(screen.getByText("Jun – Aug 2026")).toBeTruthy();
  });

  it("shows the editor's note when there is one", () => {
    page();
    expect(screen.getByText(REPORT.editorsNote)).toBeTruthy();
  });

  it("omits the note entirely rather than leaving an empty paragraph", () => {
    mockReport({ status: "ready", data: { ...REPORT, editorsNote: "" } });
    const { container } = page();
    expect(container.querySelector(".hero-b-note")).toBeNull();
  });

  it("renders all eight KPIs", () => {
    const { container } = page();
    expect(container.querySelectorAll(".kpi")).toHaveLength(8);
  });

  it("abbreviates impressions but keeps counts exact", () => {
    page();
    expect(screen.getByText("128K")).toBeTruthy(); // impressions via fmt
    expect(screen.getByText("5,542")).toBeTruthy(); // followers via fmtExact
  });

  it("shows the engagement rate to two decimals", () => {
    page();
    expect(screen.getByText("4.27%")).toBeTruthy();
  });

  it("renders an em dash for a missing engagement rate rather than crashing", () => {
    mockReport({
      status: "ready",
      data: { ...REPORT, overall: { ...REPORT.overall, avgengagementrate: null } },
    });
    const { container } = page();
    expect(container.querySelectorAll(".kpi")).toHaveLength(8);
  });
});

describe("SocialPage all-posts search", () => {
  beforeEach(() => mockReport({ status: "ready", data: REPORT }));

  it("starts with every post shown", () => {
    page();
    expect(postCount()).toBe("3 posts");
  });

  it("filters by post name", () => {
    page();
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "welder" } });
    expect(postCount()).toBe("1 posts");
  });

  it("ignores case", () => {
    page();
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "WELDER" } });
    expect(postCount()).toBe("1 posts");
  });

  it("searches the notes column too, not just the title", () => {
    page();
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "behind the scenes" } });
    expect(postCount()).toBe("1 posts");
  });

  it("ignores surrounding whitespace", () => {
    page();
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "   welder   " } });
    expect(postCount()).toBe("1 posts");
  });

  it("reports zero rather than falling back to everything when nothing matches", () => {
    page();
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "zzzz" } });
    expect(postCount()).toBe("0 posts");
  });

  it("announces the count politely, so the change is read out", () => {
    const { container } = page();
    const count = container.querySelector(".all-posts-count");
    expect(count.getAttribute("aria-live")).toBe("polite");
  });
});

describe("SocialPage all-posts platform filter", () => {
  beforeEach(() => mockReport({ status: "ready", data: REPORT }));

  it("narrows to one platform", () => {
    page();
    fireEvent.change(screen.getByLabelText("Filter by platform"), { target: { value: "linkedin" } });
    expect(postCount()).toBe("1 posts");
  });

  it("returns to everything on 'all'", () => {
    page();
    const select = screen.getByLabelText("Filter by platform");
    fireEvent.change(select, { target: { value: "facebook" } });
    expect(postCount()).toBe("1 posts");
    fireEvent.change(select, { target: { value: "all" } });
    expect(postCount()).toBe("3 posts");
  });

  it("combines with the search box rather than replacing it", () => {
    page();
    fireEvent.change(screen.getByLabelText("Filter by platform"), { target: { value: "linkedin" } });
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "office" } });
    // "Office admin role" is on Facebook, so the two filters together match nothing.
    expect(postCount()).toBe("0 posts");
  });
});

describe("SocialPage all-posts view toggle", () => {
  beforeEach(() => mockReport({ status: "ready", data: REPORT }));

  it("starts in list view", () => {
    page();
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Calendar" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("switches to calendar view", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("button", { name: "Calendar" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the active filter when switching view", () => {
    page();
    fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "welder" } });
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(postCount()).toBe("1 posts");
  });
});

describe("SocialPage platforms and top posts", () => {
  beforeEach(() => mockReport({ status: "ready", data: REPORT }));

  it("lists each platform in the order supplied", () => {
    const { container } = page();
    const grid = container.querySelector('[aria-label="Platform breakdown"]');
    expect(within(grid).getByText("LinkedIn")).toBeTruthy();
    expect(within(grid).getByText("Facebook")).toBeTruthy();
  });

  it("ranks the top posts by impressions, not by the order supplied", () => {
    const { container } = page();
    const rows = container.querySelectorAll("#top-posts tbody tr");
    expect(rows[0].textContent).toContain("Welder wanted"); // 2000
    expect(rows[1].textContent).toContain("Office admin role"); // 1000
    expect(rows[2].textContent).toContain("Team photo"); // 500
  });

  it("shows at most three", () => {
    mockReport({
      status: "ready",
      data: {
        ...REPORT,
        allPosts: Array.from({ length: 8 }, (_, i) =>
          post({ "Post Name": `Post ${i}`, Impressions: i * 100 })
        ),
      },
    });
    const { container } = page();
    expect(container.querySelectorAll("#top-posts tbody tr")).toHaveLength(3);
  });

  it("breaks an impressions tie on engagements", () => {
    mockReport({
      status: "ready",
      data: {
        ...REPORT,
        allPosts: [
          post({ "Post Name": "Fewer engagements", Impressions: 1000, Engagements: 10 }),
          post({ "Post Name": "More engagements", Impressions: 1000, Engagements: 90 }),
        ],
      },
    });
    const { container } = page();
    const rows = container.querySelectorAll("#top-posts tbody tr");
    expect(rows[0].textContent).toContain("More engagements");
  });

  it("leaves out posts with no impressions figure at all", () => {
    mockReport({
      status: "ready",
      data: {
        ...REPORT,
        allPosts: [
          post({ "Post Name": "Counted", Impressions: 100 }),
          post({ "Post Name": "Unmeasured", Impressions: null }),
        ],
      },
    });
    const { container } = page();
    const body = container.querySelector("#top-posts tbody").textContent;
    expect(body).toContain("Counted");
    expect(body).not.toContain("Unmeasured");
  });

  it("names an untitled post rather than rendering a blank cell", () => {
    mockReport({
      status: "ready",
      data: { ...REPORT, allPosts: [post({ "Post Name": "", Impressions: 100 })] },
    });
    const { container } = page();
    expect(container.querySelector("#top-posts tbody").textContent).toContain("Untitled post");
  });

  it("says so plainly when the quarter has no posts", () => {
    mockReport({ status: "ready", data: { ...REPORT, allPosts: [] } });
    page();
    expect(screen.getByText("No posts recorded this quarter.")).toBeTruthy();
  });
});

describe("SocialPage insights", () => {
  it("shows an empty note for each blank section", () => {
    mockReport({ status: "ready", data: REPORT });
    page();
    // working has one item; notWorking, actions and next are empty.
    expect(screen.getAllByText("No notes yet.")).toHaveLength(3);
    expect(screen.getByText("Job posts.")).toBeTruthy();
  });
});
