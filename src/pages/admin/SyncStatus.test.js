import { describe, expect, it } from "vitest";
import { describeRun, STALE_AFTER_DAYS } from "./SyncStatus.jsx";

const at = (daysAgo) => new Date(Date.UTC(2026, 8, 15) - daysAgo * 86400000).toISOString();
const now = new Date(Date.UTC(2026, 8, 15));
const run = (over) => describeRun({ status: "success", message: "", started_at: at(0), ...over }, now);

describe("describeRun", () => {
  it("confirms a recent successful sync", () => {
    expect(run({ started_at: at(2) })).toMatchObject({ tone: "ok" });
    expect(run({ started_at: at(2) }).text).toContain("2 days ago");
  });

  it("reads naturally for today and yesterday", () => {
    expect(run({ started_at: at(0) }).text).toContain("today");
    expect(run({ started_at: at(1) }).text).toContain("yesterday");
  });

  // The failure this whole feature exists for: not a run that errors, but a
  // run that stops happening. A stale success is a broken job, so it must not
  // read as a healthy one.
  it("warns when the last success is older than the weekly schedule allows", () => {
    expect(run({ started_at: at(STALE_AFTER_DAYS) })).toMatchObject({ tone: "warn" });
    expect(run({ started_at: at(30) }).text).toContain("may have stopped");
  });

  it("does not warn while the schedule has only missed at most one run", () => {
    expect(run({ started_at: at(STALE_AFTER_DAYS - 1) })).toMatchObject({ tone: "ok" });
  });

  it("surfaces the error text on a failed run rather than just saying it failed", () => {
    const d = run({ status: "failed", message: "GA4 runReport failed (403)" });
    expect(d.tone).toBe("error");
    expect(d.text).toContain("403");
  });

  // "Skipped" is the job deciding not to write because GA4 came back empty.
  // That is not success, and it must not display as success.
  it("distinguishes a run that deliberately wrote nothing from a successful one", () => {
    const d = run({ status: "skipped", message: "GA4 returned no session data" });
    expect(d.tone).toBe("warn");
    expect(d.text).toContain("wrote nothing");
  });

  it("says so plainly when no run has ever been recorded", () => {
    expect(describeRun(null, now)).toMatchObject({ tone: "idle" });
  });
});
