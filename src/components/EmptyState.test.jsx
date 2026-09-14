// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmptyData, EmptyNote } from "./EmptyState.jsx";

afterEach(cleanup);

describe("EmptyNote", () => {
  it("says plainly that there are no notes", () => {
    render(<EmptyNote />);
    expect(screen.getByText("No notes yet.")).toBeTruthy();
  });

  it("hides its decorative icon from screen readers", () => {
    const { container } = render(<EmptyNote />);
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("EmptyData", () => {
  it("falls back to a generic message", () => {
    render(<EmptyData />);
    expect(screen.getByText("No data available.")).toBeTruthy();
  });

  it("takes a caller-supplied message so each section can be specific", () => {
    render(<EmptyData label="No campaigns ran this quarter." />);
    expect(screen.getByText("No campaigns ran this quarter.")).toBeTruthy();
    expect(screen.queryByText("No data available.")).toBeNull();
  });

  it("hides its decorative icon from screen readers", () => {
    const { container } = render(<EmptyData />);
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
  });
});
