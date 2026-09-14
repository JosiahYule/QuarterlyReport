// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SocialForm } from "./SocialForm.jsx";
import { supabase } from "../../lib/supabase.js";

vi.mock("../../lib/supabase.js", () => ({ supabase: { from: vi.fn() } }));

/**
 * Records every operation the form performs, in order, as "table.op" strings,
 * and hands back a chainable stub shaped like the Supabase query builder.
 *
 * `failOn` makes one operation reject, so the partial-write behaviour of the
 * save can be observed.
 */
function stubSupabase({ existing = null, failOn = null } = {}) {
  const ops = [];

  const make = (table) => {
    const record = (op) => {
      const label = `${table}.${op}`;
      ops.push(label);
      return label;
    };

    // Terminal results are thenable so `await` works at any point in a chain.
    const result = (label) =>
      failOn === label
        ? { error: { message: `boom on ${label}` }, data: null }
        : { error: null, data: table === "social_reports" ? { id: "report-1" } : null };

    const chain = {
      _label: null,
      select(...args) {
        // A select with an embedded-relations string is the initial load.
        if (args[0] && String(args[0]).includes("social_kpis(")) this._label = record("select");
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: existing, error: null });
      },
      single() {
        return Promise.resolve(result(this._label));
      },
      upsert() {
        this._label = record("upsert");
        return this;
      },
      insert() {
        const label = record("insert");
        return Promise.resolve(result(label));
      },
      delete() {
        this._label = record("delete");
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(result(this._label)).then(resolve, reject);
      },
    };
    return chain;
  };

  supabase.from.mockImplementation((table) => make(table));
  return ops;
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "id-" + Math.random().toString(36).slice(2) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const form = (props) => render(<SocialForm agency="isl" quarter="q4" {...props} />);
const saveButton = () => screen.getByRole("button", { name: /^Save/ });

describe("SocialForm loading", () => {
  it("shows a loading state before the report arrives", () => {
    stubSupabase();
    form();
    expect(screen.getByText("Loading report data…")).toBeTruthy();
  });

  it("renders the form once loading finishes, even with no existing report", async () => {
    stubSupabase({ existing: null });
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("surfaces a load failure instead of showing an empty form", async () => {
    supabase.from.mockImplementation(() => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: () => Promise.resolve({ data: null, error: { message: "RLS denied" } }),
    }));
    const { container } = form();
    await waitFor(() => expect(container.querySelector(".admin-form-status--error")).toBeTruthy());
    // The server's message is deliberately not shown — the admin gets a
    // friendly line and no editable form, so a failed load can never be
    // mistaken for an empty quarter and saved over the top of real data.
    expect(container.textContent).toContain("Failed to load report data");
    expect(container.textContent).not.toContain("RLS denied");
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("SocialForm save sequence", () => {
  it("upserts the report row before touching any child table", async () => {
    const ops = stubSupabase();
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(ops).toContain("social_insights.insert"));

    const writes = ops.filter((o) => !o.endsWith(".select"));
    expect(writes[0]).toBe("social_reports.upsert");
  });

  it("clears each child table before re-inserting it", async () => {
    const ops = stubSupabase();
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(ops).toContain("social_insights.insert"));

    // For every table that gets an insert, its delete must come first.
    for (const table of ["social_kpis", "social_insights"]) {
      const del = ops.indexOf(`${table}.delete`);
      const ins = ops.indexOf(`${table}.insert`);
      expect(del).toBeGreaterThan(-1);
      expect(ins).toBeGreaterThan(del);
    }
  });

  it("clears every child table on save, including ones with nothing to insert", async () => {
    const ops = stubSupabase();
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(ops).toContain("social_insights.insert"));

    for (const table of [
      "social_kpis",
      "social_platforms",
      "social_top_posts",
      "social_posts",
      "paid_media_campaigns",
      "paid_media_demographics",
      "paid_media_click_paths",
      "social_insights",
    ]) {
      expect(ops).toContain(`${table}.delete`);
    }
  });

  it("confirms success to the user", async () => {
    stubSupabase();
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText("Saved ✓")).toBeTruthy());
  });

  it("marks the form clean again once saved", async () => {
    stubSupabase();
    const onDirtyChange = vi.fn();
    form({ onDirtyChange });
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(false));
  });
});

describe("SocialForm save failure", () => {
  it("reports the error rather than failing silently", async () => {
    stubSupabase({ failOn: "social_kpis.insert" });
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());
  });

  it("leaves the form dirty so the values are not presumed saved", async () => {
    stubSupabase({ failOn: "social_kpis.insert" });
    const onDirtyChange = vi.fn();
    form({ onDirtyChange });
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());
    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
  });

  it("stops at the first failure rather than carrying on through the remaining tables", async () => {
    const ops = stubSupabase({ failOn: "social_kpis.insert" });
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());

    expect(ops).not.toContain("social_insights.delete");
  });

  // Documents current behaviour, not desired behaviour. The save is a
  // delete-then-insert per table with no surrounding transaction, so a failure
  // partway leaves the already-deleted tables empty on the server while the
  // browser still holds the values. Recorded so a transactional save can be
  // verified against it later.
  it("has already deleted the failing table's rows by the time it reports the error", async () => {
    const ops = stubSupabase({ failOn: "social_kpis.insert" });
    form();
    await waitFor(() => expect(screen.queryByText("Loading report data…")).toBeNull());

    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Error: /)).toBeTruthy());

    expect(ops).toContain("social_kpis.delete");
    expect(ops.indexOf("social_kpis.delete")).toBeLessThan(ops.indexOf("social_kpis.insert"));
  });
});
