import { describe, it, expect } from "vitest";
import { buildCommands } from "./commands.js";
import { AGENCIES, QUARTERS } from "../config.js";

const CTX = { agency: "isl", quarter: QUARTERS[0].suffix, view: "social" };

describe("buildCommands", () => {
  it("returns every group when the query is empty", () => {
    const groups = buildCommands("", CTX);
    expect(groups.map(g => g.label)).toEqual(["Views", "Agencies", "Quarters", "Actions"]);
    expect(groups.find(g => g.label === "Agencies").items).toHaveLength(Object.keys(AGENCIES).length);
    expect(groups.find(g => g.label === "Quarters").items).toHaveLength(QUARTERS.length);
  });

  it("marks the current view, agency, and quarter", () => {
    const groups = buildCommands("", CTX);
    const current = groups.flatMap(g => g.items).filter(i => i.current);
    expect(current.map(i => i.id).sort()).toEqual(
      ["agency-isl", `quarter-${CTX.quarter}`, "view-social"].sort()
    );
  });

  it("filters case-insensitively across group boundaries", () => {
    const groups = buildCommands("WEB", CTX);
    const ids = groups.flatMap(g => g.items).map(i => i.id);
    expect(ids).toContain("view-web");
    expect(ids).not.toContain("view-trends");
  });

  it("finds agencies by short label", () => {
    const groups = buildCommands("ads", CTX);
    const ids = groups.flatMap(g => g.items).map(i => i.id);
    expect(ids).toContain("agency-ads");
  });

  it("drops empty groups and returns nothing for a nonsense query", () => {
    expect(buildCommands("zzzzzz-no-match", CTX)).toEqual([]);
  });

  it("navigation items carry the URL-state payload", () => {
    const groups = buildCommands("trends", CTX);
    const item = groups.flatMap(g => g.items).find(i => i.id === "view-trends");
    expect(item.kind).toBe("navigate");
    expect(item.payload).toEqual({ view: "trends" });
  });
});
