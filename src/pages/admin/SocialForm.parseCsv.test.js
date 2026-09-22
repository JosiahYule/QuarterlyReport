import { describe, expect, it } from "vitest";
import { parseCsv, mergeImportedPosts } from "./SocialForm.jsx";

const csv = (...lines) => lines.join("\n");

describe("parseCsv header matching", () => {
  it("reads a straightforward export", () => {
    const rows = parseCsv(
      csv("Post Name,Date,Platform,Impressions,Engagements", "Welder wanted,2026-06-01,LinkedIn,2000,40")
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      post_name: "Welder wanted",
      post_date: "2026-06-01",
      platforms: "LinkedIn",
      impressions: 2000,
      engagements: 40,
    });
  });

  it("matches headers case-insensitively", () => {
    const rows = parseCsv(csv("POST NAME,DATE,IMPRESSIONS", "A post,2026-06-01,10"));
    expect(rows[0].post_name).toBe("A post");
    expect(rows[0].impressions).toBe(10);
  });

  it("matches a header by substring, so 'Total Impressions' still counts", () => {
    const rows = parseCsv(csv("Post Name,Total Impressions", "A post,1500"));
    expect(rows[0].impressions).toBe(1500);
  });

  it("accepts 'Title' or 'Description' as the post name", () => {
    expect(parseCsv(csv("Title,Impressions", "From title,5"))[0].post_name).toBe("From title");
    expect(parseCsv(csv("Description,Impressions", "From description,5"))[0].post_name).toBe(
      "From description"
    );
  });

  it("accepts 'Link' or 'Permalink' as the URL column", () => {
    expect(parseCsv(csv("Post Name,Link", "A post,https://x.test/1"))[0].url).toBe("https://x.test/1");
    expect(parseCsv(csv("Post Name,Permalink", "A post,https://x.test/2"))[0].url).toBe("https://x.test/2");
  });

  it("prefers the first matching header when several could match", () => {
    // "post name" is checked before the looser "name".
    const rows = parseCsv(csv("Account Name,Post Name", "Acme,The real post"));
    expect(rows[0].post_name).toBe("The real post");
  });

  it("strips surrounding quotes from headers and cells", () => {
    const rows = parseCsv(csv('"Post Name","Impressions"', '"Quoted post","250"'));
    expect(rows[0].post_name).toBe("Quoted post");
    expect(rows[0].impressions).toBe(250);
  });

  it("trims whitespace around headers and cells", () => {
    const rows = parseCsv(csv("  Post Name , Impressions ", "  Spaced post , 42 "));
    expect(rows[0].post_name).toBe("Spaced post");
    expect(rows[0].impressions).toBe(42);
  });
});

describe("parseCsv missing data", () => {
  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("returns nothing for a header row with no data under it", () => {
    expect(parseCsv("Post Name,Impressions")).toEqual([]);
  });

  it("drops rows with no post name, which is what a trailing blank line looks like", () => {
    const rows = parseCsv(csv("Post Name,Impressions", "Real post,10", ",20"));
    expect(rows).toHaveLength(1);
    expect(rows[0].post_name).toBe("Real post");
  });

  it("defaults absent numeric columns to zero rather than null", () => {
    // The insert path expects numbers here, so a missing column must not
    // become null and violate the column's type.
    const rows = parseCsv(csv("Post Name", "No numbers"));
    expect(rows[0].impressions).toBe(0);
    expect(rows[0].engagements).toBe(0);
  });

  it("treats an unparseable number as zero", () => {
    const rows = parseCsv(csv("Post Name,Impressions", "A post,n/a"));
    expect(rows[0].impressions).toBe(0);
  });

  it("treats an empty numeric cell as zero", () => {
    const rows = parseCsv(csv("Post Name,Impressions", "A post,"));
    expect(rows[0].impressions).toBe(0);
  });

  it("leaves absent text columns as empty strings", () => {
    const rows = parseCsv(csv("Post Name", "A post"));
    expect(rows[0].post_date).toBe("");
    expect(rows[0].platforms).toBe("");
    expect(rows[0].url).toBe("");
    expect(rows[0].notes).toBe("");
  });

  it("fills short rows rather than reading undefined off the end", () => {
    const rows = parseCsv(csv("Post Name,Date,Impressions", "A post"));
    expect(rows[0].post_date).toBe("");
    expect(rows[0].impressions).toBe(0);
  });
});

describe("parseCsv line endings", () => {
  it("handles Windows line endings", () => {
    const rows = parseCsv("Post Name,Impressions\r\nA post,10\r\nB post,20");
    expect(rows.map((r) => r.post_name)).toEqual(["A post", "B post"]);
  });

  it("ignores leading and trailing blank lines", () => {
    const rows = parseCsv("\n\nPost Name,Impressions\nA post,10\n\n");
    expect(rows).toHaveLength(1);
  });
});

describe("parseCsv quoting", () => {
  // This used to split on every comma, so a quoted title with a comma in it
  // shifted every later column and the post landed with zero impressions.
  it("keeps a quoted field containing a comma in one piece", () => {
    const rows = parseCsv(csv("Post Name,Impressions", '"Halifax, NS office",500'));
    expect(rows[0].post_name).toBe("Halifax, NS office");
    expect(rows[0].impressions).toBe(500);
  });

  it("reads quoted thousands separators as numbers", () => {
    const rows = parseCsv(csv("Post Name,Impressions,Engagements", 'A post,"12,345","1,002"'));
    expect(rows[0].impressions).toBe(12345);
    expect(rows[0].engagements).toBe(1002);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const rows = parseCsv(csv("Post Name,Impressions", '"The ""big"" hire",10'));
    expect(rows[0].post_name).toBe('The "big" hire');
  });

  it("ignores a byte-order mark in front of the header row", () => {
    const rows = parseCsv("\uFEFFPost Name,Impressions\nA post,10");
    expect(rows[0].post_name).toBe("A post");
  });
});

describe("parseCsv dates and times", () => {
  const dateOf = (value) => parseCsv(csv("Post Name,Date", `A post,"${value}"`))[0].post_date;

  it("keeps an ISO date as it is", () => {
    expect(dateOf("2026-06-01")).toBe("2026-06-01");
  });

  it("reads slashed dates as month/day/year", () => {
    expect(dateOf("6/1/2026")).toBe("2026-06-01");
    expect(dateOf("06/01/26")).toBe("2026-06-01");
  });

  it("reads a slashed date as day/month when the first number can only be a day", () => {
    expect(dateOf("25/06/2026")).toBe("2026-06-25");
  });

  it("reads a written-out date", () => {
    expect(dateOf("Jun 1, 2026")).toBe("2026-06-01");
  });

  it("leaves an unreadable or impossible date empty rather than failing the save", () => {
    expect(dateOf("sometime in June")).toBe("");
    expect(dateOf("2026-02-30")).toBe("");
  });

  it("does not read a bare number as a date", () => {
    // The browser would take "2026" as 1 January, and a spreadsheet serial
    // day number as a date tens of thousands of years out.
    expect(dateOf("2026")).toBe("");
    expect(dateOf("45123")).toBe("");
  });

  it("takes the time from a combined date-and-time cell when there is no time column", () => {
    const rows = parseCsv(csv("Post Name,Date", "A post,06/01/2026 2:05 PM"));
    expect(rows[0].post_date).toBe("2026-06-01");
    expect(rows[0].post_time).toBe("14:05");
  });

  it("normalizes a 12-hour time column to 24-hour", () => {
    const timeOf = (value) => parseCsv(csv("Post Name,Time", `A post,${value}`))[0].post_time;
    expect(timeOf("9:30 AM")).toBe("09:30");
    expect(timeOf("12:15 am")).toBe("00:15");
    expect(timeOf("12:15 PM")).toBe("12:15");
    expect(timeOf("17:45")).toBe("17:45");
    expect(timeOf("noon")).toBe("");
  });
});

describe("mergeImportedPosts", () => {
  const post = (name, date = "2026-06-01", platforms = "LinkedIn") => ({
    post_name: name,
    post_date: date,
    platforms,
  });

  it("appends posts that are new to the log", () => {
    const { posts, added, skipped } = mergeImportedPosts([post("A")], [post("B")]);
    expect(posts.map((p) => p.post_name)).toEqual(["A", "B"]);
    expect(added).toBe(1);
    expect(skipped).toBe(0);
  });

  it("skips a post already in the log, so importing a file twice doesn't double it", () => {
    const { posts, added, skipped } = mergeImportedPosts([post("A")], [post(" a "), post("B")]);
    expect(posts).toHaveLength(2);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });

  it("keeps same-titled posts that went out on different days or platforms", () => {
    const { added } = mergeImportedPosts(
      [post("Weekly jobs")],
      [post("Weekly jobs", "2026-06-08"), post("Weekly jobs", "2026-06-01", "Facebook")]
    );
    expect(added).toBe(2);
  });

  it("drops duplicates within the imported file itself", () => {
    const { added, skipped } = mergeImportedPosts([], [post("A"), post("A")]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
  });
});
