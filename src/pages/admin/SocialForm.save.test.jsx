// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SocialForm } from "./SocialForm.jsx";
import { supabase } from "../../lib/supabase.js";
import { QUARTERS } from "../../config.js";

vi.mock("../../lib/supabase.js", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// A closed quarter, identified the way the admin identifies it.
const Q = QUARTERS[1];

/**
 * Records every table the form touches, so a test can assert that saving no
 * longer issues per-table writes from the browser at all.
 */
function stubSupabase({ existing = null, loadError = null, rpcError = null } = {}) {
  const tableOps = [];
  supabase.from.mockImplementation((table) => {
    const chain = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: () => Promise.resolve({ data: existing, error: loadError }),
      insert() {
        tableOps.push(`${table}.insert`);
        return Promise.resolve({ error: null });
      },
      delete() {
        tableOps.push(`${table}.delete`);
        return Promise.resolve({ error: null });
      },
      upsert() {
        tableOps.push(`${table}.upsert`);
        return this;
      },
      single: () => Promise.resolve({ data: { id: "r1" }, error: null }),
    };
    return chain;
  });
  supabase.rpc.mockImplementation(() => Promise.resolve({ data: rpcError ? null : "r1", error: rpcError }));
  return tableOps;
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "id-" + Math.random().toString(36).slice(2) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const form = (props) => render(<SocialForm agency="isl" quarter={Q.id} {...props} />);
const saveButton = () => screen.getByRole("button", { name: /^Save/ });
const ready = () => waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());
const payload = () => supabase.rpc.mock.calls.at(-1)[1].payload;

describe("SocialForm loading", () => {
  it("shows a loading state before the report arrives", () => {
    stubSupabase();
    form();
    expect(screen.getByText("Loading report data…")).toBeTruthy();
  });

  it("renders the form once loading finishes, even with no existing report", async () => {
    stubSupabase({ existing: null });
    form();
    await ready();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("surfaces a load failure instead of showing an empty form", async () => {
    stubSupabase({ loadError: { message: "RLS denied" } });
    const { container } = form();
    await waitFor(() => expect(container.querySelector(".admin-form-status--error")).toBeTruthy());
    // The server's message is deliberately not shown, and no editable form is
    // rendered — so a failed load can never be mistaken for an empty quarter
    // and saved over the top of real data.
    expect(container.textContent).toContain("Failed to load report data");
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("SocialForm save", () => {
  // The point of the change: the save used to be an upsert plus eight
  // delete-and-reinsert pairs issued one at a time from the browser, with
  // nothing wrapping them. It is now a single transactional RPC.
  it("saves through one RPC call", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));
    expect(supabase.rpc.mock.calls[0][0]).toBe("save_social_report");
  });

  it("issues no per-table writes from the browser, so nothing can half-complete", async () => {
    const tableOps = stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    expect(tableOps).toEqual([]);
  });

  it("identifies the report by agency, quarter and year", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    const p = payload();
    expect(p.agency).toBe("isl");
    // The database key, not the reader-facing id. Without the year the upsert
    // would overwrite the same-suffix quarter from the previous fiscal year.
    expect(p.quarter).toBe(Q.suffix);
    expect(p.year).toBe(Q.year);
  });

  it("sends every section the report is made of", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    const p = payload();
    for (const key of ["kpis", "insights"]) {
      expect(p[key], `${key} missing`).toBeTruthy();
    }
    for (const key of [
      "platforms",
      "top_posts",
      "posts",
      "campaigns",
      "ads",
      "demographics",
      "click_paths",
    ]) {
      expect(Array.isArray(p[key]), `${key} should be an array`).toBe(true);
    }
  });

  it("sends the editor's note and the KPI keys the table expects", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    const p = payload();
    expect(p).toHaveProperty("editors_note");
    for (const key of ["posts", "impressions", "followers", "avg_engagement_rate"]) {
      expect(p.kpis).toHaveProperty(key);
    }
  });

  it("confirms success to the user", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText("Saved ✓")).toBeTruthy());
  });

  it("marks the form clean again once saved", async () => {
    stubSupabase();
    const onDirtyChange = vi.fn();
    form({ onDirtyChange });
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(false));
  });
});

describe("SocialForm save failure", () => {
  it("reports the error rather than failing silently", async () => {
    stubSupabase({ rpcError: { message: "constraint violated" } });
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());
    expect(screen.getByText(/constraint violated/)).toBeTruthy();
  });

  it("leaves the form dirty so the values are not presumed saved", async () => {
    stubSupabase({ rpcError: { message: "boom" } });
    const onDirtyChange = vi.fn();
    form({ onDirtyChange });
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());
    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
  });

  // This replaces a test that recorded the old partial-write window. With the
  // whole save inside one function there is no window left to record: the
  // browser makes a single call, and the database rolls the whole thing back.
  it("touches no table directly even when the save fails", async () => {
    const tableOps = stubSupabase({ rpcError: { message: "boom" } });
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());
    expect(tableOps).toEqual([]);
  });
});
