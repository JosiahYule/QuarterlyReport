// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Delta } from "./Delta.jsx";

afterEach(cleanup);

const badge = () => document.querySelector(".delta");

describe("Delta", () => {
  it("renders nothing without a delta", () => {
    const { container } = render(<Delta d={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("signs a rise with + and a fall with a real minus sign", () => {
    render(<Delta d={{ dir: "up", pct: 12.34 }} />);
    expect(screen.getByText("+12.3%")).toBeTruthy();
    cleanup();

    render(<Delta d={{ dir: "down", pct: 4.5 }} />);
    // U+2212, not a hyphen — the CSS and the typography both assume it.
    expect(screen.getByText("−4.5%")).toBeTruthy();
  });

  it("leaves a flat delta unsigned", () => {
    render(<Delta d={{ dir: "flat", pct: 0 }} />);
    expect(screen.getByText("0.0%")).toBeTruthy();
    expect(badge().className).toContain("flat");
  });

  it("colours by direction", () => {
    render(<Delta d={{ dir: "up", pct: 1 }} />);
    expect(badge().className.split(/\s+/)).toContain("up");
  });

  describe("invertGood (lower-is-better metrics like bounce rate)", () => {
    it("keeps the sign literal but flips the colour on a fall", () => {
      render(<Delta d={{ dir: "down", pct: 8 }} invertGood />);
      // Still reads as a decrease…
      expect(screen.getByText("−8.0%")).toBeTruthy();
      // …but is coloured as good news.
      expect(badge().className.split(/\s+/)).toContain("up");
    });

    it("keeps the sign literal but flips the colour on a rise", () => {
      render(<Delta d={{ dir: "up", pct: 8 }} invertGood />);
      expect(screen.getByText("+8.0%")).toBeTruthy();
      expect(badge().className.split(/\s+/)).toContain("down");
    });

    it("leaves flat alone", () => {
      render(<Delta d={{ dir: "flat", pct: 0 }} invertGood />);
      expect(badge().className.split(/\s+/)).toContain("flat");
    });
  });

  it("describes itself for screen readers in words, not symbols", () => {
    render(<Delta d={{ dir: "down", pct: 3.21 }} />);
    expect(screen.getByLabelText("decreased 3.2 percent")).toBeTruthy();
  });

  it("passes through extra classes", () => {
    render(<Delta d={{ dir: "up", pct: 1 }} className="kpi-delta" />);
    expect(badge().className).toContain("kpi-delta");
  });
});
