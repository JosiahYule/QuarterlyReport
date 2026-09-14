// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SectionRail } from "./SectionRail.jsx";

const SECTIONS = [
  { id: "kpis", label: "Highlights" },
  { id: "channels", label: "Channels" },
  { id: "pages", label: "Top pages" },
];

/** Put real elements in the document so the rail has something to find. */
function mountSections(ids) {
  for (const id of ids) {
    const el = document.createElement("section");
    el.id = id;
    document.body.appendChild(el);
  }
}

let scrollIntoView;
beforeEach(() => {
  // jsdom implements neither of these; the component uses both.
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query.includes("no-preference"),
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
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SectionRail", () => {
  it("lists only the sections actually present on the page", () => {
    mountSections(["kpis", "channels"]);
    render(<SectionRail sections={SECTIONS} />);

    expect(screen.getByRole("button", { name: "Highlights" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Channels" })).toBeTruthy();
    // "Top pages" has no matching element, so it must not appear.
    expect(screen.queryByRole("button", { name: "Top pages" })).toBeNull();
  });

  it("hides itself entirely when there is only one section to jump to", () => {
    mountSections(["kpis"]);
    render(<SectionRail sections={SECTIONS} />);
    expect(screen.queryByRole("navigation", { name: "Report sections" })).toBeNull();
  });

  it("hides itself when the page has none of the sections", () => {
    render(<SectionRail sections={SECTIONS} />);
    expect(screen.queryByRole("navigation", { name: "Report sections" })).toBeNull();
  });

  it("renders into document.body so the wrapper's transform cannot trap it", () => {
    mountSections(["kpis", "channels"]);
    const { container } = render(<SectionRail sections={SECTIONS} />);
    // Nothing inside the component's own container…
    expect(container.querySelector(".section-rail")).toBeNull();
    // …but present in the body.
    expect(document.body.querySelector(".section-rail")).toBeTruthy();
  });

  it("scrolls to a section when its button is clicked", () => {
    mountSections(["kpis", "channels"]);
    render(<SectionRail sections={SECTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Channels" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0][0]).toEqual({ behavior: "smooth", block: "start" });
  });

  it("jumps without animation for reduced-motion users", () => {
    vi.stubGlobal("matchMedia", (query) => ({
      matches: false, // no-preference is false, i.e. motion is reduced
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }));
    mountSections(["kpis", "channels"]);
    render(<SectionRail sections={SECTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Channels" }));
    expect(scrollIntoView.mock.calls[0][0]).toEqual({ behavior: "auto", block: "start" });
  });
});
