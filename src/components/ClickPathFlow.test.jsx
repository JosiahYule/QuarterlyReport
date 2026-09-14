// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClickPathBlock } from "./ClickPathFlow.jsx";

const path = (steps, sessions, over = {}) => ({ steps, sessions, ...over });

const PATHS = [path(["/", "/jobs", "/apply"], 120), path(["/", "/jobs"], 80), path(["/contact"], 40)];

beforeEach(() => {
  // Skip the count-up animation so tile values are final on first paint.
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

const block = (props) => render(<ClickPathBlock title="After the Click" {...props} />);

describe("ClickPathBlock with nothing to show", () => {
  it("renders nothing when there are no paths", () => {
    const { container } = block({ paths: [] });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when paths is missing entirely", () => {
    const { container } = block({ paths: null });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when every journey has zero sessions", () => {
    const { container } = block({ paths: [path(["/"], 0), path(["/jobs"], 0)] });
    expect(container.innerHTML).toBe("");
  });
});

describe("ClickPathBlock headline tiles", () => {
  it("shows the title it was given", () => {
    block({ paths: PATHS });
    expect(screen.getByText("After the Click")).toBeTruthy();
  });

  it("shows an optional note only when supplied", () => {
    const { container } = block({ paths: PATHS });
    expect(container.querySelector(".aud-panel-note")).toBeNull();
    cleanup();
    block({ paths: PATHS, note: "LinkedIn campaign only" });
    expect(screen.getByText("LinkedIn campaign only")).toBeTruthy();
  });

  it("totals the sessions across every journey", () => {
    block({ paths: PATHS });
    expect(screen.getByText("240")).toBeTruthy(); // 120 + 80 + 40
  });

  it("reports the share that moved past the landing page", () => {
    block({ paths: PATHS });
    // 200 of 240 had more than one step.
    expect(screen.getByText("83%")).toBeTruthy();
    expect(screen.getByText(/200 moved past the landing page/)).toBeTruthy();
  });

  it("reports the average pages per session to one decimal", () => {
    block({ paths: PATHS });
    // (3×120 + 2×80 + 1×40) / 240 = 2.333…
    expect(screen.getByText("2.3")).toBeTruthy();
  });

  it("names the deepest journey in the singular when it is one page", () => {
    block({ paths: [path(["/"], 10)] });
    expect(screen.getByText(/deepest journey ran 1 page$/)).toBeTruthy();
  });

  it("pluralises the deepest journey when it is more than one page", () => {
    block({ paths: PATHS });
    expect(screen.getByText(/deepest journey ran 3 pages/)).toBeTruthy();
  });
});

describe("ClickPathBlock conversions", () => {
  it("shows landing pages when no journey reports conversions", () => {
    block({ paths: PATHS });
    expect(screen.getByText("Landing pages")).toBeTruthy();
    expect(screen.queryByText("Converted")).toBeNull();
  });

  it("swaps in a conversions tile once any journey reports them", () => {
    block({
      paths: [path(["/", "/jobs"], 100, { conversions: 12 }), path(["/contact"], 100)],
    });
    expect(screen.getByText("Converted")).toBeTruthy();
    expect(screen.queryByText("Landing pages")).toBeNull();
  });

  it("states the conversion rate against all sessions", () => {
    block({ paths: [path(["/", "/jobs"], 200, { conversions: 20 })] });
    expect(screen.getByText(/10\.0% of these sessions/)).toBeTruthy();
  });

  it("treats a reported zero as a real figure, not as missing", () => {
    block({ paths: [path(["/", "/jobs"], 100, { conversions: 0 })] });
    expect(screen.getByText("Converted")).toBeTruthy();
  });
});

describe("ClickPathBlock flow diagram", () => {
  it("draws the flow when journeys go more than one step deep", () => {
    const { container } = block({ paths: PATHS });
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText(/moved to another page/)).toBeTruthy();
  });

  it("omits the diagram when every session left at the landing page", () => {
    // Nothing to draw a flow between, so the legend goes too.
    const { container } = block({ paths: [path(["/"], 50), path(["/contact"], 30)] });
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByText(/moved to another page/)).toBeNull();
  });

  it("describes the diagram for screen readers", () => {
    block({ paths: PATHS });
    expect(screen.getByLabelText(/Flow of .* sessions from the pages they landed on/)).toBeTruthy();
  });
});

describe("ClickPathBlock journey table", () => {
  it("lists the routes people actually took", () => {
    block({ paths: PATHS });
    expect(screen.getAllByText("/jobs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("/apply").length).toBeGreaterThan(0);
  });

  it("handles a single-step journey without a route arrow", () => {
    expect(() => block({ paths: [path(["/contact"], 40)] })).not.toThrow();
  });

  it("survives a journey whose steps array is empty", () => {
    expect(() => block({ paths: [path([], 10), path(["/", "/jobs"], 50)] })).not.toThrow();
  });
});
