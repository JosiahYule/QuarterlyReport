// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PageSkeleton } from "./Skeleton.jsx";

afterEach(cleanup);

const kpiCards = (c) => c.querySelectorAll(".kpi-grid > div").length;

describe("PageSkeleton", () => {
  it("marks itself busy and hidden, so screen readers skip the placeholder", () => {
    const { container } = render(<PageSkeleton />);
    const main = container.querySelector("main");
    expect(main.getAttribute("aria-busy")).toBe("true");
    expect(main.getAttribute("aria-hidden")).toBe("true");
  });

  it("lays out eight KPI cards for the social view", () => {
    const { container } = render(<PageSkeleton view="social" />);
    expect(kpiCards(container)).toBe(8);
  });

  it("defaults to the social shape", () => {
    const { container } = render(<PageSkeleton />);
    expect(kpiCards(container)).toBe(8);
  });

  it("lays out six KPI cards for the web view, matching that page's grid", () => {
    const { container } = render(<PageSkeleton view="web" />);
    expect(kpiCards(container)).toBe(6);
  });

  it("uses campaign rows rather than a KPI grid for the paid view", () => {
    const { container } = render(<PageSkeleton view="paid" />);
    // The paid page is a list of campaigns, so there is no KPI grid at all.
    expect(container.querySelector(".kpi-grid")).toBeNull();
    expect(container.querySelectorAll(".skel-block").length).toBeGreaterThan(0);
  });

  it("treats an unknown view as the default rather than rendering nothing", () => {
    const { container } = render(<PageSkeleton view="not-a-view" />);
    expect(kpiCards(container)).toBe(8);
  });
});
