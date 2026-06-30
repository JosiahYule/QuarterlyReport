import { describe, it, expect } from "vitest";
import {
  classifyPost,
  dayOfWeekIndex,
  todayWeekdayIndex,
  buildPlanSuggestion,
  buildPlanNarrative,
  buildWeekPlan,
  buildScorecard,
  buildCadence,
  buildContentMix,
  buildPerformers,
  WEEKDAYS,
  MIN_SAMPLE_SIZE,
} from "./planEngine.js";

describe("classifyPost", () => {
  it("uses the Notes field as the post type when present", () => {
    expect(classifyPost({ post_name: "Friday update", notes: "job posting" })).toEqual({ key: "job posting", label: "Job Posting" });
  });
  it("trims and title-cases the notes-derived type", () => {
    expect(classifyPost({ post_name: "x", notes: "  client testimonial  " })).toEqual({ key: "client testimonial", label: "Client Testimonial" });
  });
  it("falls back to keyword matching on the post name when notes is empty", () => {
    expect(classifyPost({ post_name: "We're hiring a Payroll Clerk!", notes: "" })).toEqual({ key: "job posting", label: "Job Posting" });
  });
  it("falls back to other when nothing matches and notes is empty", () => {
    expect(classifyPost({ post_name: "Just a regular post" })).toEqual({ key: "other", label: "Other" });
  });
  it("fallback keyword match is case-insensitive", () => {
    expect(classifyPost({ post_name: "NOW HIRING for our Halifax branch" })).toEqual({ key: "job posting", label: "Job Posting" });
  });
});

describe("dayOfWeekIndex", () => {
  it("parses a YYYY-MM-DD date as a local calendar date (Monday)", () => {
    // 2026-06-29 is a Monday
    expect(dayOfWeekIndex("2026-06-29")).toBe(1);
  });
  it("returns null for missing/invalid input", () => {
    expect(dayOfWeekIndex("")).toBeNull();
    expect(dayOfWeekIndex(null)).toBeNull();
    expect(dayOfWeekIndex("not-a-date")).toBeNull();
  });
});

describe("todayWeekdayIndex", () => {
  it("matches the local weekday for a known date", () => {
    // 2026-06-30 is a Tuesday
    const d = new Date(2026, 5, 30, 12, 0, 0);
    expect(todayWeekdayIndex(d, "America/Halifax")).toBe(2);
  });
});

function post(post_name, post_date, impressions, engagements, notes = "") {
  return { post_name, post_date, impressions, engagements, notes };
}

describe("buildPlanSuggestion", () => {
  it("returns status 'empty' when there are no usable posts", () => {
    expect(buildPlanSuggestion([])).toEqual({ status: "empty" });
    expect(buildPlanSuggestion([post("No date", "", 100, 10)])).toEqual({ status: "empty" });
    expect(buildPlanSuggestion([post("Zero impressions", "2026-06-01", 0, 0)])).toEqual({ status: "empty" });
  });

  it("picks the best day and content type once each has enough samples", () => {
    const posts = [
      // 3 job postings on Mondays at a high engagement rate
      post("Now hiring A", "2026-06-01", 1000, 200),
      post("Now hiring B", "2026-06-08", 1000, 220),
      post("Now hiring C", "2026-06-15", 1000, 180),
      // 3 generic posts on Wednesdays at a lower engagement rate
      post("Update A", "2026-06-03", 1000, 50),
      post("Update B", "2026-06-10", 1000, 40),
      post("Update C", "2026-06-17", 1000, 60),
    ];
    const plan = buildPlanSuggestion(posts, { now: new Date(2026, 5, 1) });
    expect(plan.status).toBe("ready");
    expect(plan.sampleSize).toBe(6);
    expect(plan.bestType.key).toBe("job posting");
    expect(plan.bestDay.name).toBe("Monday");
    expect(plan.confidence).toBe("high");
  });

  it("groups by the Notes field directly when posts have it set", () => {
    const posts = [
      post("Now hiring A", "2026-06-01", 1000, 200, "Job Posting"),
      post("Now hiring B", "2026-06-08", 1000, 220, "job posting"),
      post("Now hiring C", "2026-06-15", 1000, 180, "  job posting  "),
    ];
    const plan = buildPlanSuggestion(posts);
    expect(plan.typeBreakdown).toHaveLength(1);
    expect(plan.typeBreakdown[0]).toMatchObject({ key: "job posting", label: "Job Posting", count: 3 });
  });

  it("excludes buckets below MIN_SAMPLE_SIZE from 'best of' picks", () => {
    const posts = [
      post("Now hiring A", "2026-06-01", 1000, 900), // huge rate, but only 1 post
      post("Update A", "2026-06-03", 1000, 50),
      post("Update B", "2026-06-10", 1000, 40),
      post("Update C", "2026-06-17", 1000, 60),
    ];
    expect(MIN_SAMPLE_SIZE).toBeGreaterThan(1);
    const plan = buildPlanSuggestion(posts);
    expect(plan.bestType?.key).not.toBe("job posting");
  });

  it("flags today's bucket when today matches the best day", () => {
    const posts = [
      post("A", "2026-06-01", 1000, 200), // Monday
      post("B", "2026-06-08", 1000, 200), // Monday
      post("C", "2026-06-15", 1000, 200), // Monday
    ];
    const monday = new Date(2026, 5, 22, 12); // a Monday
    const plan = buildPlanSuggestion(posts, { now: monday });
    expect(plan.bestDay.name).toBe("Monday");
    expect(plan.todayBucket.key).toBe(plan.bestDay.key);
  });
});

describe("buildWeekPlan", () => {
  it("returns one entry per weekday, Monday–Friday", () => {
    const week = buildWeekPlan([]);
    expect(week).toHaveLength(5);
    expect(week.map(d => d.dayName)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(WEEKDAYS).toEqual([1, 2, 3, 4, 5]);
  });

  it("picks the best content type for each specific day", () => {
    const posts = [
      // Mondays: two job postings beat one company update
      post("Hiring 1", "2026-03-02", 1000, 200, "job posting"),
      post("Hiring 2", "2026-03-09", 1000, 220, "job posting"),
      post("Update 1", "2026-03-16", 1000, 50, "company update"),
      // Tuesdays: testimonials
      post("Story 1", "2026-03-03", 1000, 300, "testimonial"),
      post("Story 2", "2026-03-10", 1000, 280, "testimonial"),
    ];
    const week = buildWeekPlan(posts);
    const mon = week.find(d => d.dayName === "Monday");
    const tue = week.find(d => d.dayName === "Tuesday");
    expect(mon.bestType.label).toBe("Job Posting");
    expect(mon.confident).toBe(true);
    expect(tue.bestType.label).toBe("Testimonial");
  });

  it("returns bestType null for days with no posts", () => {
    const posts = [post("Hiring", "2026-03-02", 1000, 200, "job posting")]; // Monday only
    const week = buildWeekPlan(posts);
    expect(week.find(d => d.dayName === "Wednesday").bestType).toBeNull();
  });

  it("still surfaces a leading type below minPerCell but flags it not confident", () => {
    const posts = [post("Hiring", "2026-03-02", 1000, 200, "job posting")]; // one Monday post
    const week = buildWeekPlan(posts, { minPerCell: 2 });
    const mon = week.find(d => d.dayName === "Monday");
    expect(mon.bestType.label).toBe("Job Posting");
    expect(mon.confident).toBe(false);
  });
});

describe("buildScorecard", () => {
  it("computes quarter-over-quarter deltas", () => {
    const cur = [
      post("A", "2026-06-01", 1000, 200),
      post("B", "2026-06-08", 1000, 200),
    ];
    const prev = [post("C", "2026-03-01", 1000, 100)];
    const sc = buildScorecard(cur, prev);
    expect(sc.hasPrev).toBe(true);
    const posts = sc.metrics.find(m => m.key === "posts");
    expect(posts.value).toBe(2);
    expect(posts.delta).toBe(100); // 1 → 2 posts = +100%
    const eng = sc.metrics.find(m => m.key === "engagement");
    expect(eng.value).toBeCloseTo(0.2, 5); // 400/2000
    expect(eng.delta).toBeCloseTo(100, 5); // 0.1 → 0.2 = +100%
  });

  it("reports hasPrev false and null deltas with no prior quarter", () => {
    const sc = buildScorecard([post("A", "2026-06-01", 1000, 200)], []);
    expect(sc.hasPrev).toBe(false);
    expect(sc.metrics.every(m => m.delta === null)).toBe(true);
  });
});

describe("buildCadence", () => {
  it("returns empty status when there are no dated posts", () => {
    expect(buildCadence([]).status).toBe("empty");
  });

  it("measures days since last post, pace, and largest gap", () => {
    const posts = [
      post("A", "2026-06-01", 1000, 100), // Monday
      post("B", "2026-06-08", 1000, 100), // +7
      post("C", "2026-06-22", 1000, 100), // +14 (largest gap)
    ];
    const c = buildCadence(posts, {
      now: new Date(2026, 5, 29),
      quarterStart: new Date(2026, 5, 1),
      quarterEnd: new Date(2026, 8, 1),
    });
    expect(c.status).toBe("ready");
    expect(c.postCount).toBe(3);
    expect(c.daysSinceLast).toBe(7);   // Jun 22 → Jun 29
    expect(c.largestGap).toBe(14);     // Jun 8 → Jun 22
    expect(c.goneDark).toBe(true);     // 7 ≥ default threshold
  });

  it("does not flag gone-dark when a post is recent", () => {
    const posts = [post("A", "2026-06-27", 1000, 100)];
    const c = buildCadence(posts, { now: new Date(2026, 5, 29), quarterStart: new Date(2026, 5, 1), quarterEnd: new Date(2026, 8, 1) });
    expect(c.daysSinceLast).toBe(2);
    expect(c.goneDark).toBe(false);
  });
});

describe("buildContentMix", () => {
  it("flags an under-posted, over-performing type as an opportunity", () => {
    // 8 company updates (low engagement) + 2 testimonials (high engagement)
    const posts = [
      ...Array.from({ length: 8 }, (_, i) => post(`U${i}`, "2026-06-01", 1000, 30, "company update")),
      post("T1", "2026-06-02", 1000, 300, "testimonial"),
      post("T2", "2026-06-03", 1000, 320, "testimonial"),
    ];
    const mix = buildContentMix(posts);
    const testimonial = mix.rows.find(r => r.label === "Testimonial");
    const update = mix.rows.find(r => r.label === "Company Update");
    expect(testimonial.flag).toBe("opportunity"); // 20% share, well above overall rate
    expect(update.flag).toBe("overinvested");      // 80% share, below overall rate
  });

  it("returns empty rows with no posts", () => {
    expect(buildContentMix([]).rows).toEqual([]);
  });
});

describe("buildPerformers", () => {
  it("ranks posts by engagement rate, top and bottom", () => {
    const posts = [
      post("Best", "2026-06-01", 1000, 500),   // 50%
      post("Mid", "2026-06-02", 1000, 200),    // 20%
      post("Worst", "2026-06-03", 1000, 50),   // 5%
      post("Low", "2026-06-04", 1000, 80),     // 8%
    ];
    const perf = buildPerformers(posts, { limit: 2 });
    expect(perf.total).toBe(4);
    expect(perf.top.map(p => p.postName)).toEqual(["Best", "Mid"]);
    expect(perf.bottom.map(p => p.postName)).toEqual(["Worst", "Low"]);
  });

  it("omits the bottom list when there aren't enough posts", () => {
    const posts = [post("A", "2026-06-01", 1000, 200), post("B", "2026-06-02", 1000, 100)];
    expect(buildPerformers(posts, { limit: 3 }).bottom).toEqual([]);
  });
});

describe("buildPlanNarrative", () => {
  it("returns empty string for a non-ready plan", () => {
    expect(buildPlanNarrative({ status: "empty" })).toBe("");
    expect(buildPlanNarrative(null)).toBe("");
  });

  it("calls out low-confidence data explicitly", () => {
    const plan = { status: "ready", bestType: null, bestDay: null };
    expect(buildPlanNarrative(plan)).toMatch(/not enough posts/i);
  });

  it("mentions both best type and best day when available", () => {
    const plan = {
      status: "ready",
      overallRate: 0.1,
      bestType: { key: "job_posting", label: "Job Posting", avgEngagementRate: 0.2, count: 3 },
      bestDay: { key: 1, name: "Monday", avgEngagementRate: 0.18 },
      todayName: "Tuesday",
      todayBucket: { key: 2 },
    };
    const text = buildPlanNarrative(plan);
    expect(text).toMatch(/Job Posting/);
    expect(text).toMatch(/Monday/);
  });
});
