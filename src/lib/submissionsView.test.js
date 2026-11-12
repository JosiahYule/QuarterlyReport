import { describe, it, expect } from "vitest";
import { halifaxToday, daysAgo, shortWhen, fullWhen, city, countByEmail, toCsv } from "./submissionsView.js";

const TODAY = "2026-11-12"; // a Thursday

describe("halifaxToday", () => {
  it("uses Halifax's date, not the viewer's", () => {
    // 02:30 UTC on Nov 13 is still 22:30 on Nov 12 in Halifax (UTC-4).
    expect(halifaxToday(new Date("2026-11-13T02:30:00Z"))).toBe("2026-11-12");
  });
});

describe("daysAgo", () => {
  it("counts calendar days, ignoring the time of day", () => {
    expect(daysAgo("2026-11-12 23:59:00", TODAY)).toBe(0);
    expect(daysAgo("2026-11-11 00:01:00", TODAY)).toBe(1);
    expect(daysAgo("2026-10-13 09:00:00", TODAY)).toBe(30);
  });
  it("returns null for a timestamp it can't read", () => {
    expect(daysAgo("", TODAY)).toBeNull();
  });
});

describe("shortWhen", () => {
  it("names today and yesterday, then weekdays, then dates", () => {
    expect(shortWhen("2026-11-12 15:40:00", TODAY)).toBe("Today, 3:40 p.m.");
    expect(shortWhen("2026-11-12 00:05:00", TODAY)).toBe("Today, 12:05 a.m.");
    expect(shortWhen("2026-11-11 09:00:00", TODAY)).toBe("Yesterday");
    expect(shortWhen("2026-11-09 09:00:00", TODAY)).toBe("Mon");
    expect(shortWhen("2026-11-03 09:00:00", TODAY)).toBe("Nov 3");
    expect(shortWhen("2025-12-30 09:00:00", TODAY)).toBe("Dec 30, 2025");
  });
});

describe("fullWhen", () => {
  it("formats the stored wall-clock time as written", () => {
    expect(fullWhen("2026-11-12 15:40:00")).toBe("Nov 12, 2026, 3:40 p.m.");
  });
});

describe("city", () => {
  it("drops the province", () => {
    expect(city("St. John's, NL")).toBe("St. John's");
    expect(city("")).toBe("");
  });
});

describe("countByEmail", () => {
  it("counts repeat submitters and ignores blank emails", () => {
    const counts = countByEmail([
      { email: "a@x.ca" },
      { email: "a@x.ca" },
      { email: "b@x.ca" },
      { email: "" },
    ]);
    expect(counts.get("a@x.ca")).toBe(2);
    expect(counts.get("b@x.ca")).toBe(1);
    expect(counts.has("")).toBe(false);
  });
});

describe("toCsv", () => {
  const row = {
    submitted_at: "2026-11-12 15:40:00",
    intent: "staff",
    name: "Chloé Martin",
    email: "c@x.ca",
    phone: "+1 902 555 0100",
    location: "Halifax, NS",
    source: "Google Search",
    source_detail: "",
    comments: 'Need two "temp" clerks,\nstarting Monday',
    document_url: "",
  };

  it("starts with a byte-order mark so Excel reads accents correctly", () => {
    expect(toCsv([row]).charCodeAt(0)).toBe(0xfeff);
  });

  it("quotes commas, quotes and line breaks", () => {
    const csv = toCsv([row]);
    expect(csv).toContain('"Need two ""temp"" clerks,\nstarting Monday"');
    expect(csv).toContain("Employer lead");
  });

  it("neutralises cells a spreadsheet would run as a formula", () => {
    const csv = toCsv([{ ...row, comments: '=HYPERLINK("http://evil")', name: "@sum" }]);
    expect(csv).toContain("'@sum");
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    // A phone number beginning with + would otherwise be read as a formula too.
    expect(csv).toContain("'+1 902 555 0100");
  });
});
