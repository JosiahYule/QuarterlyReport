// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { CountUp } from "./CountUp.jsx";
import { fmt } from "../utils.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * jsdom's requestAnimationFrame timestamp and its performance.now() do not
 * share a time origin, so a real-clock test of this component drifts and
 * flakes. Drive both from one clock we control instead: deterministic, and
 * it lets us assert what the interim frames actually are.
 */
function installClock() {
  let t = 1000;
  let pending = [];
  vi.stubGlobal("performance", { now: () => t });
  vi.stubGlobal("requestAnimationFrame", (cb) => pending.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = [];
  });
  return {
    async advance(ms) {
      t += ms;
      const due = pending;
      pending = [];
      await act(async () => {
        due.forEach((cb) => cb(t));
      });
    },
  };
}

/** Force `prefers-reduced-motion` to a given answer. */
function stubReducedMotion(reduce) {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query.includes("reduce") ? reduce : !reduce,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

describe("CountUp", () => {
  it("shows non-numeric values immediately, with no animation to run", () => {
    const { container } = render(<CountUp value={null} format={fmt} />);
    expect(container.textContent).toBe("—");
  });

  it("does not animate strings", () => {
    const { container } = render(<CountUp value="n/a" format={fmt} />);
    expect(container.textContent).toBe("n/a");
  });

  it("refuses to animate NaN or Infinity, which have no path from zero", () => {
    const { container: nan } = render(<CountUp value={NaN} format={fmt} />);
    expect(nan.textContent).toBe("—");
    const { container: inf } = render(<CountUp value={Infinity} format={fmt} />);
    expect(inf.textContent).toBe("—");
  });

  it("starts from zero and lands exactly on the final figure", async () => {
    stubReducedMotion(false);
    const clock = installClock();
    const { container } = render(<CountUp value={5000} format={fmt} duration={100} />);

    // First paint is the floor, not the answer.
    expect(container.textContent).toBe("0");

    await clock.advance(50);
    expect(container.textContent).not.toBe("0");
    expect(container.textContent).not.toBe("5.0K");

    await clock.advance(50);
    expect(container.textContent).toBe("5.0K");
  });

  it("never overshoots, even if a frame lands past the duration", async () => {
    stubReducedMotion(false);
    const clock = installClock();
    const { container } = render(<CountUp value={250} format={String} duration={100} />);

    // A stalled tab can deliver the next frame long after the deadline.
    await clock.advance(5000);
    expect(container.textContent).toBe("250");
  });

  it("eases out, so the early frames move faster than the late ones", async () => {
    stubReducedMotion(false);
    const clock = installClock();
    const { container } = render(<CountUp value={1000} format={String} duration={100} />);

    await clock.advance(25);
    const quarter = Number(container.textContent);
    await clock.advance(25);
    const half = Number(container.textContent);

    // Cubic ease-out: a quarter of the time buys well over a quarter of the
    // distance, and the first half covers more ground than the second.
    expect(quarter).toBeGreaterThan(250);
    expect(half).toBeGreaterThan(500);
  });

  it("gives reduced-motion users the final figure with no interim frames", () => {
    stubReducedMotion(true);
    const { container } = render(<CountUp value={5000} format={fmt} duration={700} />);
    expect(container.textContent).toBe("5.0K");
  });

  it("keeps integers integral while counting", async () => {
    stubReducedMotion(false);
    const clock = installClock();
    const seen = [];
    const spyFormat = (n) => {
      seen.push(n);
      return String(n);
    };
    render(<CountUp value={400} format={spyFormat} duration={100} />);
    await clock.advance(33);
    await clock.advance(33);
    await clock.advance(34);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every(Number.isInteger)).toBe(true);
  });

  it("keeps decimals fractional while counting", async () => {
    stubReducedMotion(false);
    const clock = installClock();
    const seen = [];
    render(<CountUp value={12.5} format={(n) => (seen.push(n), String(n))} duration={100} />);
    await clock.advance(50);
    expect(seen.some((n) => !Number.isInteger(n))).toBe(true);
  });

  it("re-animates from zero when the value changes", async () => {
    stubReducedMotion(false);
    const clock = installClock();
    const { container, rerender } = render(<CountUp value={100} format={String} duration={100} />);
    await clock.advance(100);
    expect(container.textContent).toBe("100");

    rerender(<CountUp value={250} format={String} duration={100} />);
    await clock.advance(100);
    expect(container.textContent).toBe("250");
  });
});
