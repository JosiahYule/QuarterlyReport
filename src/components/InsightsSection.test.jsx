// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InsightsSection, toPoints } from "./InsightsSection.jsx";

afterEach(cleanup);

describe("toPoints", () => {
  // The bug this replaced: Social split on any newline, Web only on a blank
  // line, so the same text rendered differently on the two reports.
  it("starts a new point at a single line break", () => {
    expect(toPoints("Job posts did well\nCareers page traffic up")).toEqual([
      "Job posts did well",
      "Careers page traffic up",
    ]);
  });

  it("treats a blank line the same as a single break", () => {
    expect(toPoints("Job posts did well\n\nCareers page traffic up")).toEqual([
      "Job posts did well",
      "Careers page traffic up",
    ]);
  });

  it("gives the same answer for both spacings, which is the whole point", () => {
    expect(toPoints("a\nb")).toEqual(toPoints("a\n\nb"));
  });

  it("keeps a single paragraph whole", () => {
    expect(toPoints("One clear point.")).toEqual(["One clear point."]);
  });

  it("accepts the array shape the social hook produces", () => {
    expect(toPoints(["First point\nSecond point"])).toEqual(["First point", "Second point"]);
  });

  it("trims stray whitespace rather than rendering blank bullets", () => {
    expect(toPoints("  padded  \n\n   \n other  ")).toEqual(["padded", "other"]);
  });

  it("returns nothing for empty or missing input", () => {
    expect(toPoints("")).toEqual([]);
    expect(toPoints(null)).toEqual([]);
    expect(toPoints(undefined)).toEqual([]);
    expect(toPoints([])).toEqual([]);
    expect(toPoints("   \n  \n ")).toEqual([]);
  });

  it("ignores non-string entries instead of crashing", () => {
    expect(toPoints([null, "real", 42])).toEqual(["real"]);
  });
});

describe("InsightsSection", () => {
  it("shows all four headings", () => {
    render(<InsightsSection insights={{}} />);
    for (const label of ["Working", "Not working", "Actions", "Next quarter"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows an empty note for every blank field", () => {
    render(<InsightsSection insights={{}} />);
    expect(screen.getAllByText("No notes yet.")).toHaveLength(4);
  });

  it("renders with no insights object at all", () => {
    render(<InsightsSection insights={undefined} />);
    expect(screen.getAllByText("No notes yet.")).toHaveLength(4);
  });

  it("renders each point as its own bullet", () => {
    const { container } = render(<InsightsSection insights={{ working: "First\nSecond\nThird" }} />);
    expect(container.querySelectorAll(".note.working li")).toHaveLength(3);
  });

  it("reads the array shape the social report produces", () => {
    render(<InsightsSection insights={{ actions: ["Book the shoot"] }} />);
    expect(screen.getByText("Book the shoot")).toBeTruthy();
    expect(screen.getAllByText("No notes yet.")).toHaveLength(3);
  });

  it("keeps the colour-coded classes the stylesheet targets", () => {
    const { container } = render(<InsightsSection insights={{}} />);
    expect(container.querySelector(".note.working")).toBeTruthy();
    expect(container.querySelector(".note.notworking")).toBeTruthy();
  });
});
