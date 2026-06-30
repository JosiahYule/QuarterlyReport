import { describe, it, expect } from "vitest";
import {
  classifyPost,
  dayOfWeekIndex,
  todayWeekdayIndex,
  buildPlanSuggestion,
  buildPlanNarrative,
  MIN_SAMPLE_SIZE,
} from "./planEngine.js";

describe("classifyPost", () => {
  it("matches job-posting keywords", () => {
    expect(classifyPost({ post_name: "We're hiring a Payroll Clerk!" })).toBe("job_posting");
  });
  it("matches keywords in notes when the title doesn't", () => {
    expect(classifyPost({ post_name: "Friday update", notes: "client testimonial from ABC Co." })).toBe("client_story");
  });
  it("falls back to other when nothing matches", () => {
    expect(classifyPost({ post_name: "Just a regular post" })).toBe("other");
  });
  it("is case-insensitive", () => {
    expect(classifyPost({ post_name: "NOW HIRING for our Halifax branch" })).toBe("job_posting");
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
    expect(plan.bestType.key).toBe("job_posting");
    expect(plan.bestDay.name).toBe("Monday");
    expect(plan.confidence).toBe("high");
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
    expect(plan.bestType?.key).not.toBe("job_posting");
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
