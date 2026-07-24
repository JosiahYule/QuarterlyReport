import { describe, it, expect } from "vitest";
import { parseLinkedInDemographics } from "./linkedinDemographics.js";

describe("parseLinkedInDemographics", () => {
  it("parses a job function export with a metadata preamble and Total row", () => {
    const csv = [
      '"Report: Demographics Report"',
      '"Date Range: Apr 1, 2026 - Jun 30, 2026"',
      "",
      '"Job Function","Impressions","Clicks","Click Through Rate","Average CPM"',
      '"Human Resources","12,480","214","1.71%","$8.12"',
      '"Operations","8,902","96","1.08%","$7.44"',
      '"Total","21,382","310","1.45%","$7.84"',
    ].join("\n");
    expect(parseLinkedInDemographics(csv)).toEqual({
      dimension: "job_function",
      rows: [
        { segment: "Human Resources", impressions: 12480, clicks: 214 },
        { segment: "Operations", impressions: 8902, clicks: 96 },
      ],
    });
  });

  it("keeps commas inside quoted segment names (locations)", () => {
    const csv =
      'Location,Impressions,Clicks\n' +
      '"Halifax, Nova Scotia Area","5,200",44\n' +
      '"Moncton, New Brunswick Area",1200,9';
    const out = parseLinkedInDemographics(csv);
    expect(out.dimension).toBe("location");
    expect(out.rows[0]).toEqual({ segment: "Halifax, Nova Scotia Area", impressions: 5200, clicks: 44 });
  });

  it("detects company size before generic company", () => {
    const csv = "Company Size,Impressions,Clicks\n51-200 employees,900,12";
    expect(parseLinkedInDemographics(csv).dimension).toBe("company_size");
  });

  it("does not read Click Through Rate as the clicks column", () => {
    const csv =
      'Job Seniority,Impressions,Click Through Rate\n' +
      'Senior,"3,000",0.95%';
    expect(parseLinkedInDemographics(csv)).toEqual({
      dimension: "seniority",
      rows: [{ segment: "Senior", impressions: 3000, clicks: null }],
    });
  });

  it("skips rows without a numeric impressions value", () => {
    const csv = "Industry,Impressions,Clicks\nConstruction,-,3\nStaffing,400,7";
    expect(parseLinkedInDemographics(csv).rows).toEqual([
      { segment: "Staffing", impressions: 400, clicks: 7 },
    ]);
  });

  it("returns null for a file with no demographics header", () => {
    expect(parseLinkedInDemographics("Date,Spend\n2026-04-01,120")).toBeNull();
    expect(parseLinkedInDemographics("")).toBeNull();
  });
});
