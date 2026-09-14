// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { reportError } from "../lib/monitor.js";

vi.mock("../lib/monitor.js", () => ({ reportError: vi.fn() }));

// React logs every caught error to console.error. That is expected here and
// would otherwise bury the real test output.
let consoleError;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  consoleError.mockRestore();
  vi.clearAllMocks();
});

function Boom({ fail }) {
  if (fail) throw new Error("section blew up");
  return <p>section content</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("section content")).toBeTruthy();
  });

  it("swaps in a fallback instead of taking the page down", () => {
    render(
      <ErrorBoundary>
        <Boom fail={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("This section couldn't be displayed.")).toBeTruthy();
    expect(screen.queryByText("section content")).toBeNull();
  });

  it("announces the failure to assistive tech", () => {
    render(
      <ErrorBoundary>
        <Boom fail={true} />
      </ErrorBoundary>
    );
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("reports the error with the component stack for debugging", () => {
    render(
      <ErrorBoundary>
        <Boom fail={true} />
      </ErrorBoundary>
    );
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = reportError.mock.calls[0];
    expect(error.message).toBe("section blew up");
    expect(context.source).toBe("ErrorBoundary");
    expect(context.componentStack).toBeTruthy();
  });

  it("retry clears the error so a transient failure can recover", () => {
    function Flaky({ shouldFail }) {
      if (shouldFail.current) throw new Error("transient");
      return <p>recovered</p>;
    }
    const shouldFail = { current: true };

    render(
      <ErrorBoundary>
        <Flaky shouldFail={shouldFail} />
      </ErrorBoundary>
    );
    expect(screen.getByText("This section couldn't be displayed.")).toBeTruthy();

    shouldFail.current = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("recovered")).toBeTruthy();
  });
});
