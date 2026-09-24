// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppNav } from "./Nav.jsx";
import { AGENCIES, QUARTERS } from "../config.js";

const BASE = { agency: "isl", view: "social", quarter: QUARTERS[0].id };

let onNavigate;

beforeEach(() => {
  onNavigate = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nav = (extra) => render(<AppNav {...BASE} onNavigate={onNavigate} {...extra} />);

const agencyButton = () => screen.getByRole("button", { name: /Current agency/ });
const quarterButton = () => screen.getByRole("button", { name: /Current quarter/ });

describe("AppNav tabs", () => {
  it("offers every report view", () => {
    nav();
    const tabs = screen.getByRole("navigation", { name: "Report views" });
    for (const label of ["Social Media", "Website", "Paid Media", "Trends"]) {
      expect(within(tabs).getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("marks only the current view as the current page", () => {
    nav({ view: "web" });
    expect(screen.getByRole("button", { name: "Website" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Trends" }).getAttribute("aria-current")).toBeNull();
  });

  it("navigates by view id, not by label", () => {
    nav();
    fireEvent.click(screen.getByRole("button", { name: "Paid Media" }));
    expect(onNavigate).toHaveBeenCalledWith({ view: "paid" });
  });
});

describe("AppNav agency switcher", () => {
  it("names the current agency in full for screen readers", () => {
    nav({ agency: "as" });
    expect(agencyButton().getAttribute("aria-label")).toContain(AGENCIES.as.name);
  });

  it("falls back to ISL when handed an agency that does not exist", () => {
    nav({ agency: "nope" });
    expect(screen.getByText(AGENCIES.isl.name)).toBeTruthy();
  });

  it("stays closed until asked", () => {
    nav();
    expect(screen.queryByRole("menu", { name: "Switch agency" })).toBeNull();
    expect(agencyButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on click and lists every agency", () => {
    nav();
    fireEvent.click(agencyButton());
    expect(agencyButton().getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Switch agency" });
    for (const cfg of Object.values(AGENCIES)) {
      expect(within(menu).getByRole("menuitem", { name: new RegExp(cfg.name) })).toBeTruthy();
    }
  });

  it("focuses the current agency when it opens, not the first", () => {
    nav({ agency: "ads" });
    fireEvent.click(agencyButton());
    expect(document.activeElement.textContent).toContain(AGENCIES.ads.name);
  });

  it("navigates and closes when an agency is chosen", () => {
    nav();
    fireEvent.click(agencyButton());
    fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(AGENCIES.as.name) }));
    expect(onNavigate).toHaveBeenCalledWith({ agency: "as" });
    expect(screen.queryByRole("menu", { name: "Switch agency" })).toBeNull();
  });

  it("wraps around with the arrow keys", () => {
    nav({ agency: "isl" });
    fireEvent.click(agencyButton());
    const keys = Object.keys(AGENCIES);

    fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
    expect(document.activeElement.textContent).toContain(AGENCIES[keys[keys.length - 1]].name);

    fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
    expect(document.activeElement.textContent).toContain(AGENCIES[keys[0]].name);
  });

  it("jumps to the ends with Home and End", () => {
    nav();
    fireEvent.click(agencyButton());
    const keys = Object.keys(AGENCIES);

    fireEvent.keyDown(document.activeElement, { key: "End" });
    expect(document.activeElement.textContent).toContain(AGENCIES[keys[keys.length - 1]].name);

    fireEvent.keyDown(document.activeElement, { key: "Home" });
    expect(document.activeElement.textContent).toContain(AGENCIES[keys[0]].name);
  });

  it("closes on Escape without navigating", () => {
    nav();
    fireEvent.click(agencyButton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Switch agency" })).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("closes when you press somewhere else on the page", () => {
    nav();
    fireEvent.click(agencyButton());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Switch agency" })).toBeNull();
  });
});

describe("AppNav quarter chooser", () => {
  it("falls back to the current quarter when handed an unknown one", () => {
    nav({ quarter: "not-a-quarter" });
    expect(quarterButton().getAttribute("aria-label")).toContain(QUARTERS[0].title);
  });

  it("opens and offers every quarter", () => {
    nav();
    fireEvent.click(quarterButton());
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(QUARTERS.length);
  });

  it("groups the quarters by fiscal year", () => {
    nav();
    fireEvent.click(quarterButton());
    for (const fy of new Set(QUARTERS.map((q) => q.fiscalYear))) {
      expect(screen.getByText(fy)).toBeTruthy();
    }
  });

  // By full id: the menu can hold two Q1s from different fiscal years.
  it("navigates by id and closes", () => {
    nav();
    fireEvent.click(quarterButton());
    const target = QUARTERS[1];
    fireEvent.click(screen.getByRole("menuitem", { name: `${target.label} · ${target.rangeLabel}` }));
    expect(onNavigate).toHaveBeenCalledWith({ quarter: target.id });
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("opens the two menus independently", () => {
    nav();
    fireEvent.click(agencyButton());
    expect(agencyButton().getAttribute("aria-expanded")).toBe("true");
    expect(quarterButton().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("AppNav has no command palette", () => {
  it("offers no search control in the header", () => {
    nav();
    expect(screen.queryByRole("button", { name: /command menu|search/i })).toBeNull();
    expect(document.querySelector(".nav-cmdk")).toBeNull();
  });
});

describe("AppNav scroll elevation", () => {
  it("is flat at the top of the page", () => {
    const { container } = nav();
    expect(container.querySelector("header").className).not.toContain("is-scrolled");
  });

  it("lifts once the page scrolls under it", () => {
    const { container } = nav();
    window.scrollY = 120;
    fireEvent.scroll(window);
    expect(container.querySelector("header").className).toContain("is-scrolled");
    window.scrollY = 0;
  });
});
