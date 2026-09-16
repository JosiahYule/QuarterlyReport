// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SyncStatus } from "./SyncStatus.jsx";

const mock = vi.hoisted(() => ({ from: vi.fn(), or: vi.fn(), limit: vi.fn() }));
vi.mock("../../lib/supabase.js", () => ({ supabase: { from: mock.from } }));
beforeEach(() => {
  const chain = { select: vi.fn(), eq: vi.fn(), or: mock.or, order: vi.fn(), limit: mock.limit };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  mock.from.mockReturnValue(chain);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("includes setup failures that happened before an agency was selected", async () => {
  mock.limit.mockResolvedValue({
    data: [
      {
        status: "failed",
        message: "GA4_SERVICE_ACCOUNT_JSON is not set",
        started_at: new Date().toISOString(),
      },
    ],
    error: null,
  });
  render(<SyncStatus agency="isl" quarter="q4" />);
  expect(await screen.findByText(/GA4_SERVICE_ACCOUNT_JSON is not set/)).toBeTruthy();
  expect(mock.or).toHaveBeenCalledWith(
    expect.stringMatching(/^and\(agency\.eq\.isl,quarter\.eq\.q4,year\.eq\.\d{4}\),agency\.is\.null$/)
  );
});

it("distinguishes an unreadable log table from no runs", async () => {
  mock.limit.mockResolvedValue({ data: null, error: { message: "table missing" } });
  render(<SyncStatus agency="isl" quarter="q4" />);
  expect(await screen.findByText(/Could not load GA4 sync status/)).toBeTruthy();
  expect(screen.queryByText(/No GA4 sync recorded/)).toBeNull();
});

it("shows a fetch failure instead of leaving the status blank", async () => {
  mock.limit.mockRejectedValue(new Error("offline"));
  render(<SyncStatus agency="isl" quarter="q4" />);
  expect(await screen.findByText(/Could not load GA4 sync status/)).toBeTruthy();
});

it("clears a previous agency's success while the new agency loads", async () => {
  mock.limit.mockResolvedValueOnce({
    data: [{ status: "success", started_at: new Date().toISOString() }],
    error: null,
  });
  const { rerender } = render(<SyncStatus agency="isl" quarter="q4" />);
  expect(await screen.findByText(/GA4 synced today/)).toBeTruthy();
  mock.limit.mockReturnValue(new Promise(() => {}));
  rerender(<SyncStatus agency="as" quarter="q4" />);
  expect(screen.queryByText(/GA4 synced today/)).toBeNull();
});
