// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette.jsx";

const PROPS = { agency: "isl", quarter: "q1", view: "social" };

let onNavigate, onClose;

beforeEach(() => {
  onNavigate = vi.fn();
  onClose = vi.fn();
  // jsdom implements neither, and the palette uses both.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn() } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = (extra) =>
  render(<CommandPalette {...PROPS} onNavigate={onNavigate} onClose={onClose} {...extra} />);
const input = () => screen.getByRole("combobox");
const options = () => screen.getAllByRole("option");
const activeOption = () => options().find((o) => o.getAttribute("aria-selected") === "true");

describe("CommandPalette", () => {
  it("is a labelled modal dialog", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Command menu" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("takes focus on open so you can type straight away", () => {
    open();
    expect(document.activeElement).toBe(input());
  });

  it("locks body scroll while open and restores it on close", () => {
    document.body.style.overflow = "auto";
    const { unmount } = open();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("returns focus to whatever was focused before it opened", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = open();
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  describe("keyboard navigation", () => {
    it("starts with the first option active", () => {
      open();
      expect(activeOption()).toBe(options()[0]);
    });

    it("moves down and back up with the arrow keys", () => {
      open();
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      expect(activeOption()).toBe(options()[1]);
      fireEvent.keyDown(input(), { key: "ArrowUp" });
      expect(activeOption()).toBe(options()[0]);
    });

    it("wraps from the last option back to the first", () => {
      open();
      const last = options().length;
      for (let i = 0; i < last; i++) fireEvent.keyDown(input(), { key: "ArrowDown" });
      expect(activeOption()).toBe(options()[0]);
    });

    it("wraps backwards from the first option to the last", () => {
      open();
      fireEvent.keyDown(input(), { key: "ArrowUp" });
      expect(activeOption()).toBe(options()[options().length - 1]);
    });

    it("jumps to the ends with Home and End", () => {
      open();
      fireEvent.keyDown(input(), { key: "End" });
      expect(activeOption()).toBe(options()[options().length - 1]);
      fireEvent.keyDown(input(), { key: "Home" });
      expect(activeOption()).toBe(options()[0]);
    });

    it("keeps focus in the input when Tab is pressed", () => {
      open();
      const ev = fireEvent.keyDown(input(), { key: "Tab" });
      // fireEvent returns false when preventDefault was called.
      expect(ev).toBe(false);
      expect(document.activeElement).toBe(input());
    });

    it("closes on Escape", () => {
      open();
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("running a command", () => {
    it("navigates on Enter and then closes", () => {
      open();
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate.mock.calls[0][0]).toEqual({ view: "social" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("navigates on click", () => {
      open();
      fireEvent.click(screen.getByRole("option", { name: /Web/i }));
      expect(onNavigate).toHaveBeenCalledWith({ view: "web" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("switches agency", () => {
      open();
      fireEvent.click(screen.getByRole("option", { name: /Accountant Staffing/i }));
      expect(onNavigate).toHaveBeenCalledWith({ agency: "as" });
    });

    it("copies the current URL to the clipboard", () => {
      open();
      fireEvent.click(screen.getByRole("option", { name: /Copy link to this view/i }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("leaves the palette open while navigating to admin, since the page is unloading", () => {
      // Assigning window.location.href is a navigation jsdom cannot perform,
      // so stand in a plain object and just record the assignment.
      const loc = { href: "http://localhost/" };
      vi.stubGlobal("location", loc);
      open();
      fireEvent.click(screen.getByRole("option", { name: /Open admin/i }));
      expect(loc.href).toBe("/admin");
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("searching", () => {
    it("filters the list as you type", () => {
      open();
      const before = options().length;
      fireEvent.change(input(), { target: { value: "trends" } });
      expect(options().length).toBeLessThan(before);
    });

    it("resets the selection to the top when the query changes", () => {
      open();
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      fireEvent.change(input(), { target: { value: "a" } });
      expect(activeOption()).toBe(options()[0]);
    });

    it("says so when nothing matches, quoting what was typed", () => {
      open();
      fireEvent.change(input(), { target: { value: "zzzznope" } });
      expect(screen.queryAllByRole("option")).toHaveLength(0);
      expect(screen.getByText(/No results for/)).toBeTruthy();
      expect(screen.getByText(/zzzznope/)).toBeTruthy();
    });

    it("does nothing on Enter when there is no match to run", () => {
      open();
      fireEvent.change(input(), { target: { value: "zzzznope" } });
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(onNavigate).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("screen reader wiring", () => {
    it("points aria-activedescendant at the active option", () => {
      open();
      expect(input().getAttribute("aria-activedescendant")).toBe(activeOption().id);
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      expect(input().getAttribute("aria-activedescendant")).toBe(activeOption().id);
    });

    it("checks the option matching the view you are already on", () => {
      open();
      const current = screen.getByRole("option", { name: /Social/i });
      const other = screen.getByRole("option", { name: /Web/i });
      expect(current.querySelector(".cmdk-option-check")).toBeTruthy();
      expect(other.querySelector(".cmdk-option-check")).toBeNull();
    });

    it("moves the check when a different view is current", () => {
      open({ view: "trends" });
      expect(
        screen.getByRole("option", { name: /Trends/i }).querySelector(".cmdk-option-check")
      ).toBeTruthy();
      expect(screen.getByRole("option", { name: /Social/i }).querySelector(".cmdk-option-check")).toBeNull();
    });
  });

  describe("dismissing", () => {
    it("closes when the backdrop is pressed", () => {
      const { container } = open();
      fireEvent.pointerDown(container.querySelector(".cmdk-overlay"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stays open when the panel itself is pressed", () => {
      open();
      fireEvent.pointerDown(screen.getByRole("dialog"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
