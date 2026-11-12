// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SubmissionsTab } from "./SubmissionsTab.jsx";
import { supabase } from "../../lib/supabase.js";

vi.mock("../../lib/supabase.js", () => ({ supabase: { from: vi.fn() } }));

const base = {
  agency: "isl",
  phone: "",
  location: "Moncton, NB",
  source: "Google Search",
  source_detail: "",
  comments: "",
  document_url: "https://example.com/cv.pdf",
  accepts_marketing: false,
};

const ROWS = [
  {
    ...base,
    id: "1",
    submitted_at: "2026-11-12 10:00:00",
    name: "Pat Employer",
    email: "pat@biz.ca",
    intent: "staff",
    location: "Halifax, NS",
    comments: "We need three receptionists for December.",
    phone: "902-555-0100",
  },
  {
    ...base,
    id: "2",
    submitted_at: "2026-11-10 09:00:00",
    name: "Sam Seeker",
    email: "sam@x.ca",
    intent: "work",
  },
  {
    ...base,
    id: "3",
    submitted_at: "2026-06-01 09:00:00",
    name: "Sam Seeker",
    email: "sam@x.ca",
    intent: "work",
  },
  {
    ...base,
    id: "4",
    submitted_at: "2026-05-01 09:00:00",
    name: "Lee Other",
    email: "lee@x.ca",
    intent: "work",
    source: "LinkedIn",
  },
];

function stub(rows = ROWS) {
  supabase.from.mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data: rows, error: null }),
    };
    return chain;
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T16:00:00Z")); // midday in Halifax
  window.localStorage.clear();
  stub();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const names = () => screen.queryAllByRole("button", { expanded: false }).map((b) => b.textContent);

describe("SubmissionsTab", () => {
  it("lists submissions newest first with counts per type", async () => {
    render(<SubmissionsTab agency="isl" />);
    expect(await screen.findByText("Pat Employer")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /All 4/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Employer leads 1/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Job seekers 3/ })).toBeTruthy();
    // The comment is previewed on the row itself, no click needed.
    expect(screen.getByText("We need three receptionists for December.")).toBeTruthy();
  });

  it("switches to employer leads only", async () => {
    render(<SubmissionsTab agency="isl" />);
    await screen.findByText("Pat Employer");
    fireEvent.click(screen.getByRole("tab", { name: /Employer leads/ }));
    expect(screen.queryByText("Lee Other")).toBeNull();
    expect(screen.getByText("Pat Employer")).toBeTruthy();
  });

  it("narrows by time period and keeps the type counts in step", async () => {
    render(<SubmissionsTab agency="isl" />);
    await screen.findByText("Pat Employer");
    fireEvent.change(screen.getByLabelText("Time period"), { target: { value: "7" } });
    expect(screen.queryByText("Lee Other")).toBeNull();
    expect(screen.getByRole("tab", { name: /All 2/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Job seekers 1/ })).toBeTruthy();
  });

  it("marks repeat submitters and can show all of one person's submissions", async () => {
    render(<SubmissionsTab agency="isl" />);
    await screen.findByText("Pat Employer");
    expect(screen.getAllByText("×2")).toHaveLength(2);
    fireEvent.click(screen.getAllByText("Sam Seeker")[0]);
    const detail = document.getElementById("sub-2");
    expect(within(detail).getByText(/2 submissions from this email/)).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Show all" }));
    expect(screen.getByLabelText(/Search/).value).toBe("sam@x.ca");
    expect(screen.queryByText("Pat Employer")).toBeNull();
  });

  it("opens a row to show contact details", async () => {
    render(<SubmissionsTab agency="isl" />);
    fireEvent.click(await screen.findByText("Pat Employer"));
    const detail = document.getElementById("sub-1");
    expect(within(detail).getByRole("link", { name: "pat@biz.ca" }).getAttribute("href")).toBe(
      "mailto:pat@biz.ca"
    );
    expect(within(detail).getByRole("link", { name: "902-555-0100" }).getAttribute("href")).toBe(
      "tel:9025550100"
    );
    expect(within(detail).getByRole("link", { name: /Open file/ })).toBeTruthy();
  });

  it("marks rows that are new since the last visit", async () => {
    window.localStorage.setItem("submissions:lastSeen:isl", "2026-11-11 00:00:00");
    render(<SubmissionsTab agency="isl" />);
    await screen.findByText("Pat Employer");
    expect(screen.getByText(/1 new since your last visit/)).toBeTruthy();
    expect(screen.getAllByTitle("New since your last visit")).toHaveLength(1);
    // The newest row is remembered for next time.
    expect(window.localStorage.getItem("submissions:lastSeen:isl")).toBe("2026-11-12 10:00:00");
  });

  it("shows no new marks on a first visit", async () => {
    render(<SubmissionsTab agency="isl" />);
    await screen.findByText("Pat Employer");
    expect(screen.queryByText(/new since your last visit/)).toBeNull();
  });

  it("offers to clear filters when nothing matches", async () => {
    render(<SubmissionsTab agency="isl" />);
    await screen.findByText("Pat Employer");
    fireEvent.change(screen.getByLabelText(/Search/), { target: { value: "nobody-here" } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Lee Other")).toBeTruthy();
    expect(names().length).toBeGreaterThan(0);
  });
});
