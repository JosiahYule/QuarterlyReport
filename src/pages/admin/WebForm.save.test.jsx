// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebForm } from "./WebForm.jsx";
import { supabase } from "../../lib/supabase.js";

vi.mock("../../lib/supabase.js", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

/**
 * Records every table the form touches, so a test can assert that saving no
 * longer issues per-table writes from the browser at all, and every filter the
 * load applies, so a test can assert the year is among them.
 */
function stubSupabase({ existing = null, loadError = null, rpcError = null } = {}) {
  const tableOps = [];
  const filters = [];
  supabase.from.mockImplementation((table) => {
    const chain = {
      select() {
        return this;
      },
      eq(col, val) {
        filters.push([col, val]);
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
  return { tableOps, filters };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const form = (props) => render(<WebForm agency="isl" quarter="q4" {...props} />);
const saveButton = () => screen.getByRole("button", { name: /^Save/ });
const ready = () => waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());
const payload = () => supabase.rpc.mock.calls.at(-1)[1].payload;

describe("WebForm loading", () => {
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
    // A failed load must never be mistaken for an empty quarter and saved
    // over the top of real data.
    expect(container.textContent).toContain("Failed to load report data");
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  // web_reports is keyed (agency, quarter, year). A suffix repeats every
  // fiscal year, so loading on the suffix alone would eventually match two
  // rows and maybeSingle() would fail — or worse, load the wrong year and let
  // a save overwrite it.
  it("loads the report by agency, quarter and year", async () => {
    const { filters } = stubSupabase();
    form();
    await ready();
    const cols = filters.map(([col]) => col);
    expect(cols).toContain("agency");
    expect(cols).toContain("quarter");
    expect(cols).toContain("year");
  });
});

describe("WebForm save", () => {
  // The point of the change: the save used to be an upsert plus four
  // delete-and-reinsert pairs issued one at a time from the browser, with
  // nothing wrapping them. It is now a single transactional RPC.
  it("saves through one RPC call", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));
    expect(supabase.rpc.mock.calls[0][0]).toBe("save_web_report");
  });

  it("issues no per-table writes from the browser, so nothing can half-complete", async () => {
    const { tableOps } = stubSupabase();
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
    expect(p.quarter).toBeTruthy();
    // Year is a text column, and without it the upsert would overwrite the
    // same-suffix quarter from the previous fiscal year.
    expect(typeof p.year).toBe("string");
    expect(p.year).toMatch(/^\d{4}$/);
  });

  // save_web_report merges on key presence, so an omitted section is left
  // standing rather than cleared. That is what makes the GA4 job safe, and it
  // is also why the admin form has to keep sending every section: clearing a
  // field by hand must still clear it.
  it("sends every section, so clearing a field by hand still clears it", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    const p = payload();
    expect(p).toHaveProperty("summary_bullet");
    expect(p).toHaveProperty("kpis");
    expect(p).toHaveProperty("insights");
    expect(Array.isArray(p.channels)).toBe(true);
    expect(Array.isArray(p.pages)).toBe(true);
  });

  it("sends the KPI keys the table expects", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    for (const key of [
      "sessions",
      "users",
      "engagement_rate",
      "avg_engagement_time_sec",
      "actions",
      "form_submissions",
    ]) {
      expect(payload().kpis).toHaveProperty(key);
    }
  });

  it("sends the insight keys the table expects", async () => {
    stubSupabase();
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    for (const key of ["working", "not_working", "actions", "next_quarter"]) {
      expect(payload().insights).toHaveProperty(key);
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

describe("WebForm save failure", () => {
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

  it("touches no table directly even when the save fails", async () => {
    const { tableOps } = stubSupabase({ rpcError: { message: "boom" } });
    form();
    await ready();

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());
    expect(tableOps).toEqual([]);
  });
});
