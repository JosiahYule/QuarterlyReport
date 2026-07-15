import { describe, it, expect } from "vitest";
import { parseCsvRecords, normalizeSubmissions } from "./formSubmissions.js";

const HEADER =
  '"America/Halifax","Charlottetown Services","Documents","Email","General Comments/Questions",' +
  '"Halifax Services","How did you hear about us?","Location","Moncton Services","Name","Phone",' +
  '"Please describe","Radio","Saint John Services","Accepts Marketing"';

describe("parseCsvRecords", () => {
  it("handles quoted fields containing commas and escaped quotes", () => {
    const recs = parseCsvRecords('"a,b","say ""hi""",c\nd,e,f');
    expect(recs).toEqual([['a,b', 'say "hi"', 'c'], ['d', 'e', 'f']]);
  });
  it("keeps raw newlines inside quoted fields", () => {
    const recs = parseCsvRecords('"line one\nline two",x\r\ny,z');
    expect(recs).toEqual([['line one\nline two', 'x'], ['y', 'z']]);
  });
  it("drops blank records", () => {
    expect(parseCsvRecords('a,b\n\n,\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe("normalizeSubmissions", () => {
  it("maps a job-seeker row, reading intent from the branch services column", () => {
    const csv = HEADER + "\n" +
      '"2026-07-15 07:58:42",,"https://x.test/resume.pdf","Person@Example.com",' +
      '"I would like a job.\nThanks.","Looking for Work","Facebook","Halifax, NS",,' +
      '"Jose Sandiga","(782) 640-4989","",,,"false"';
    const { rows, skipped } = normalizeSubmissions(csv, "isl");
    expect(skipped).toBe(0);
    expect(rows).toEqual([{
      agency: "isl",
      submitted_at: "2026-07-15 07:58:42",
      name: "Jose Sandiga",
      email: "person@example.com",
      phone: "(782) 640-4989",
      location: "Halifax, NS",
      intent: "work",
      source: "Facebook",
      source_detail: "",
      comments: "I would like a job.\nThanks.",
      document_url: "https://x.test/resume.pdf",
      accepts_marketing: false,
    }]);
  });

  it("reads employer intent from the misnamed Radio (St. John's) column", () => {
    const csv = HEADER + "\n" +
      '"2026-07-14 12:26:11",,"","kevin@gdi.test","","","Other","St. John\'s, NL",,' +
      '"Kevin Hurd","(902) 403-0086","We have done business before","Looking for Staff",,"true"';
    const { rows } = normalizeSubmissions(csv, "isl");
    expect(rows[0].intent).toBe("staff");
    expect(rows[0].source_detail).toBe("We have done business before");
    expect(rows[0].accepts_marketing).toBe(true);
  });

  it("skips rows without a well-formed timestamp and counts them", () => {
    const csv = HEADER + "\n" +
      '"not a date",,,"a@b.test","",,,,,"X","",,,,"false"\n' +
      '"2026-07-13 09:00:00",,,"c@d.test","",,,,,"Y","",,,,"false"';
    const { rows, skipped } = normalizeSubmissions(csv, "isl");
    expect(skipped).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Y");
  });

  it("marks rows with no service column filled as unknown intent", () => {
    const csv = HEADER + "\n" +
      '"2026-07-13 09:00:00",,,"c@d.test","",,,"Moncton, NB",,"Y","",,,,"false"';
    const { rows } = normalizeSubmissions(csv, "isl");
    expect(rows[0].intent).toBe("unknown");
  });
});
