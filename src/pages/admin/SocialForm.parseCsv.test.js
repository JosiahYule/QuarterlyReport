import { describe, expect, it } from "vitest";
import { parseCsv } from "./SocialForm.jsx";

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

describe("parseCsv known limitation", () => {
  // The parser splits on commas without honouring quoting, so a quoted field
  // containing a comma shifts every later column. Recorded here deliberately:
  // this is current behaviour, and worth knowing before trusting an import
  // with free-text notes in it.
  it("mis-splits a quoted field containing a comma", () => {
    const rows = parseCsv(csv("Post Name,Impressions", '"Halifax, NS office",500'));
    expect(rows[0].post_name).toBe("Halifax");
    expect(rows[0].impressions).toBe(0);
  });
});
