import { describe, it, expect } from "vitest";
import {
  classifyPost,
  dayOfWeekIndex,
  todayWeekdayIndex,
  classifyTimeOfDay,
  buildPlanSuggestion,
  buildPlanNarrative,
  buildWeekPlan,
  thisWeekDates,
  JOB_AD_MIN_GAP_DAYS,
  buildScorecard,
  buildCadence,
  buildContentFreshness,
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

describe("classifyTimeOfDay", () => {
  it("buckets a time into the matching window", () => {
    expect(classifyTimeOfDay("08:30")).toEqual({ key: "early_morning", label: "Early Morning (6–9am)" });
    expect(classifyTimeOfDay("10:15")).toEqual({ key: "late_morning", label: "Late Morning (9am–12pm)" });
    expect(classifyTimeOfDay("13:00")).toEqual({ key: "afternoon", label: "Afternoon (12–3pm)" });
    expect(classifyTimeOfDay("16:45")).toEqual({ key: "late_afternoon", label: "Late Afternoon (3–6pm)" });
    expect(classifyTimeOfDay("19:00")).toEqual({ key: "evening", label: "Evening (6pm+)" });
  });
  it("folds pre-dawn hours into Evening rather than a sparse sixth bucket", () => {
    expect(classifyTimeOfDay("02:00")).toEqual({ key: "evening", label: "Evening (6pm+)" });
  });
  it("returns null for missing/invalid input", () => {
    expect(classifyTimeOfDay("")).toBeNull();
    expect(classifyTimeOfDay(null)).toBeNull();
    expect(classifyTimeOfDay(undefined)).toBeNull();
    expect(classifyTimeOfDay("not-a-time")).toBeNull();
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

  it("picks the best time-of-day slot once it has enough samples, without gating confidence on it", () => {
    const posts = [
      { ...post("Morning A", "2026-06-01", 1000, 300), post_time: "09:00" },
      { ...post("Morning B", "2026-06-08", 1000, 300), post_time: "09:15" },
      { ...post("Morning C", "2026-06-15", 1000, 300), post_time: "09:30" },
      { ...post("Evening A", "2026-06-02", 1000, 100), post_time: "19:00" },
      { ...post("Evening B", "2026-06-09", 1000, 100), post_time: "19:15" },
      { ...post("Evening C", "2026-06-16", 1000, 100), post_time: "19:30" },
    ];
    const plan = buildPlanSuggestion(posts);
    expect(plan.bestTime.key).toBe("late_morning");
    expect(plan.timeBreakdown).toHaveLength(2);
  });

  it("leaves bestTime null (not 'low' confidence) when no post has a recorded time", () => {
    const posts = [
      post("A", "2026-06-01", 1000, 200),
      post("B", "2026-06-08", 1000, 220),
      post("C", "2026-06-15", 1000, 180),
    ];
    const plan = buildPlanSuggestion(posts);
    expect(plan.bestTime).toBeNull();
    expect(plan.timeBreakdown).toEqual([]);
    expect(plan.confidence).not.toBe("low"); // day/type patterns still found
  });
});

describe("buildWeekPlan", () => {
  const NOW = { now: new Date(2026, 5, 15) };

  it("returns one entry per weekday, Monday–Friday", () => {
    const week = buildWeekPlan([], NOW);
    expect(week).toHaveLength(5);
    expect(week.map(d => d.dayName)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(WEEKDAYS).toEqual([1, 2, 3, 4, 5]);
  });

  it("reserves exactly two job-ad days (perm + contract), even when job ads win more days back-to-back", () => {
    const posts = [
      // Job ads perform best on Mon > Tue > Wed — three strong days in a row.
      post("Hiring Mon 1", "2026-06-01", 1000, 300, "job posting"),
      post("Hiring Mon 2", "2026-06-08", 1000, 300, "job posting"),
      post("Hiring Tue 1", "2026-06-02", 1000, 250, "job posting"),
      post("Hiring Tue 2", "2026-06-09", 1000, 250, "job posting"),
      post("Hiring Wed 1", "2026-06-03", 1000, 150, "job posting"),
      post("Hiring Wed 2", "2026-06-10", 1000, 150, "job posting"),
      // Other content on Thu (testimonial) and Fri (tips)
      post("Story Thu 1", "2026-06-04", 1000, 280, "testimonial"),
      post("Story Thu 2", "2026-06-11", 1000, 280, "testimonial"),
      post("Tips Fri 1", "2026-06-05", 1000, 200, "tips"),
      post("Tips Fri 2", "2026-06-12", 1000, 200, "tips"),
    ];
    const week = buildWeekPlan(posts, NOW);
    const jobDays = week.filter(d => d.slot === "job");
    expect(jobDays).toHaveLength(2); // capped at 2 despite 3 strong job days
    // Monday+Tuesday scores highest on paper, but they're adjacent, and
    // Monday+Wednesday is still only one day apart — the two-clear-days rule
    // pushes the second slot out to Friday instead.
    expect(jobDays.map(d => d.dayName)).toEqual(["Monday", "Friday"]);
    expect(jobDays.map(d => d.roleLabel)).toEqual(["Permanent", "Contract"]);
    // Thursday, freed up by Wednesday losing out, gets the best content type.
    expect(week.find(d => d.dayName === "Thursday").bestType.label).toBe("Testimonial");
  });

  it("never places two job-ad days within the minimum gap of each other", () => {
    const week = buildWeekPlan([], NOW); // no history — ties broken deterministically
    const jobDays = week.filter(d => d.slot === "job").map(d => d.dayIndex);
    expect(jobDays).toHaveLength(2);
    expect(Math.abs(jobDays[0] - jobDays[1])).toBeGreaterThan(JOB_AD_MIN_GAP_DAYS);
  });

  it("fills the non-job days with distinct content types for diversity", () => {
    const posts = [
      // Job ads only on Monday
      post("Hiring 1", "2026-06-01", 1000, 300, "job posting"),
      post("Hiring 2", "2026-06-08", 1000, 300, "job posting"),
      // Testimonials best on both Tue and Wed; diversity should still spread types
      post("Story Tue", "2026-06-02", 1000, 320, "testimonial"),
      post("Story Tue2", "2026-06-09", 1000, 320, "testimonial"),
      post("Story Wed", "2026-06-03", 1000, 300, "testimonial"),
      post("Story Wed2", "2026-06-10", 1000, 300, "testimonial"),
      post("Tips Wed", "2026-05-20", 1000, 120, "tips"),
      post("Tips Wed2", "2026-05-27", 1000, 120, "tips"),
    ];
    const week = buildWeekPlan(posts, NOW);
    const contentLabels = week.filter(d => d.slot === "content" && d.bestType).map(d => d.bestType.label);
    // No content type is used twice across the non-job days.
    expect(new Set(contentLabels).size).toBe(contentLabels.length);
    expect(contentLabels).toContain("Testimonial");
    expect(contentLabels).toContain("Tips");
  });

  it("suggests fresh content (null) on a content day with no history", () => {
    const posts = [
      post("Hiring 1", "2026-06-01", 1000, 300, "job posting"),
      post("Hiring 2", "2026-06-08", 1000, 300, "job posting"),
      post("Story Tue", "2026-06-02", 1000, 280, "testimonial"),
      post("Story Tue2", "2026-06-09", 1000, 280, "testimonial"),
    ];
    const week = buildWeekPlan(posts, NOW);
    // Friday has no content history → no specific suggestion.
    const friday = week.find(d => d.dayName === "Friday");
    expect(friday.slot === "content" ? friday.bestType : "(job day)").toBeNull();
  });
});

describe("thisWeekDates", () => {
  it("returns the Mon-Fri calendar dates for the week containing `now`", () => {
    // 2026-07-08 is a Wednesday; that week runs Mon 7/6 - Fri 7/10.
    const dates = thisWeekDates(new Date(2026, 6, 8));
    expect(dates).toEqual({
      1: "2026-07-06",
      2: "2026-07-07",
      3: "2026-07-08",
      4: "2026-07-09",
      5: "2026-07-10",
    });
  });
});

describe("buildWeekPlan — cross-page signal bias", () => {
  const NOW = { now: new Date(2026, 5, 15) }; // Monday

  it("without any signal, ranks purely on historical engagement (baseline)", () => {
    const posts = [
      post("Story Wed", "2026-06-03", 1000, 310, "testimonial"),
      post("Tips Wed", "2026-06-10", 1000, 280, "tips"),
    ];
    const wed = buildWeekPlan(posts, NOW).find(d => d.dayName === "Wednesday");
    // Wednesday can never be a job day — it's never >2 days from both ends
    // of a Mon-Fri week — so this isolates the content-type pick cleanly.
    expect(wed.slot).toBe("content");
    expect(wed.bestType.label).toBe("Testimonial"); // higher raw rate wins
  });

  it("platformFocus tips a near-tied pick toward the type with a track record on that platform", () => {
    const posts = [
      { ...post("Story Wed", "2026-06-03", 1000, 310, "testimonial"), platforms: "Facebook" },
      { ...post("Tips Wed", "2026-06-10", 1000, 280, "tips"), platforms: "LinkedIn" },
    ];
    const platformFocus = { status: "ready", platform: "LinkedIn", weight: 1 };
    const wed = buildWeekPlan(posts, { ...NOW, platformFocus }).find(d => d.dayName === "Wednesday");
    expect(wed.bestType.label).toBe("Tips");
    // The displayed track record is always the true historical rate, never the boosted rank score.
    expect(wed.bestType.avgEngagementRate).toBeCloseTo(0.28, 5);
  });

  it("platformFocus doesn't touch the ranking when the signal is empty", () => {
    const posts = [
      { ...post("Story Wed", "2026-06-03", 1000, 310, "testimonial"), platforms: "Facebook" },
      { ...post("Tips Wed", "2026-06-10", 1000, 280, "tips"), platforms: "LinkedIn" },
    ];
    const wed = buildWeekPlan(posts, { ...NOW, platformFocus: { status: "empty", weight: 0 } }).find(d => d.dayName === "Wednesday");
    expect(wed.bestType.label).toBe("Testimonial");
  });

  it("webFunnel tips a near-tied pick toward the type that actually links back to the site", () => {
    const posts = [
      post("Story Wed", "2026-06-03", 1000, 310, "testimonial"),
      { ...post("Tips Wed", "2026-06-10", 1000, 280, "tips"), url: "https://example.com/careers" },
    ];
    const webFunnel = { status: "ready", weight: 1, favorLinked: true };
    const wed = buildWeekPlan(posts, { ...NOW, webFunnel }).find(d => d.dayName === "Wednesday");
    expect(wed.bestType.label).toBe("Tips");
    expect(wed.bestType.avgEngagementRate).toBeCloseTo(0.28, 5);
  });

  it("jobAdSignal marks chosen job days with recommendBoost, and leaves other slots false", () => {
    const week = buildWeekPlan([], { ...NOW, jobAdSignal: { status: "ready", weight: 0.5 } });
    const jobDays = week.filter(d => d.slot === "job");
    expect(jobDays.length).toBeGreaterThan(0);
    expect(jobDays.every(d => d.recommendBoost === true)).toBe(true);
    expect(week.filter(d => d.slot !== "job").every(d => d.recommendBoost === false)).toBe(true);
  });

  it("jobAdSignal can shift which day gets the job-ad slot by boosting every day's job score alike", () => {
    // Tuned tightly to JOB_BOOST_MAX (currently 0.2): Friday's organic job
    // rate (.30) beats Thursday's (.10) by .20, and Friday's own content
    // ("Company Update", .32) beats Thursday's ("Video", .10) by .22 — just
    // enough that, at baseline, keeping Friday for content and running the
    // job ad on Thursday wins narrowly. A full-weight job signal boosts every
    // day's job score by (1 + JOB_BOOST_MAX), which is enough to flip that:
    // Friday's much stronger job rate now outweighs its content slot instead.
    const posts = [
      post("Hiring Mon", "2026-06-01", 1000, 100, "job posting"), // Monday job rate .10 (common to both combos)
      post("Hiring Thu", "2026-06-04", 1000, 100, "job posting"), // Thursday job rate .10
      post("Hiring Fri", "2026-06-05", 1000, 300, "job posting"), // Friday job rate .30
      post("Story Tue",  "2026-06-02", 1000, 500, "testimonial"), // Tuesday content .50 (common to both combos)
      post("Clip Thu",   "2026-06-04", 1000, 100, "video"),       // Thursday content, if freed up: .10
      post("News Fri",   "2026-06-05", 1000, 320, "company update"), // Friday content, if freed up: .32
    ];

    const baseline = buildWeekPlan(posts, NOW);
    expect(baseline.find(d => d.dayName === "Thursday").slot).toBe("job");
    expect(baseline.find(d => d.dayName === "Friday").slot).toBe("content");

    const jobAdSignal = { status: "ready", weight: 1 };
    const boosted = buildWeekPlan(posts, { ...NOW, jobAdSignal });
    expect(boosted.find(d => d.dayName === "Friday").slot).toBe("job");
    expect(boosted.find(d => d.dayName === "Thursday").slot).toBe("content");
  });
});

describe("buildWeekPlan — this week's actual posts", () => {
  // 2026-07-08 is a Wednesday; this week runs Mon 7/6 - Fri 7/10.
  const WED = { now: new Date(2026, 6, 8) };

  it("shows a day as already posted when a real post is logged on that calendar date", () => {
    const posts = [post("Weekly update", "2026-07-06", 500, 50, "team culture")]; // this Monday
    const week = buildWeekPlan(posts, WED);
    const monday = week.find(d => d.dayName === "Monday");
    expect(monday.slot).toBe("posted");
    expect(monday.posted).toEqual([{ label: "Team Culture", postName: "Weekly update" }]);
    expect(monday.confident).toBe(true);
  });

  it("flags a past day this week with nothing logged as missed", () => {
    const posts = [post("Weekly update", "2026-07-06", 500, 50, "team culture")]; // only Monday posted
    const week = buildWeekPlan(posts, WED);
    const tuesday = week.find(d => d.dayName === "Tuesday"); // 7/7, before "today" (7/8), nothing logged
    expect(tuesday.slot).toBe("missed");
    expect(tuesday.confident).toBe(false);
  });

  it("excludes a content type already posted this week from the remaining days' suggestions", () => {
    const posts = [
      // Historical: testimonials are the strongest Thursday content, tips second.
      post("Story Thu 1", "2026-06-04", 1000, 300, "testimonial"),
      post("Story Thu 2", "2026-06-11", 1000, 300, "testimonial"),
      post("Tips Thu 1", "2026-06-18", 1000, 150, "tips"),
      post("Tips Thu 2", "2026-06-25", 1000, 150, "tips"),
      // Already posted a testimonial this Monday.
      post("This week testimonial", "2026-07-06", 1000, 300, "testimonial"),
    ];
    const week = buildWeekPlan(posts, WED);
    const thursday = week.find(d => d.dayName === "Thursday");
    expect(thursday.slot).toBe("content");
    expect(thursday.bestType.label).toBe("Tips");
  });

  it("reduces the remaining job-ad slots and assigns the leftover role when one's already posted this week", () => {
    const posts = [
      // Historical: job ads perform best on Thursday.
      post("Hiring Thu 1", "2026-06-04", 1000, 300, "job posting"),
      post("Hiring Thu 2", "2026-06-11", 1000, 300, "job posting"),
      // Already posted the Permanent job ad this Monday.
      post("This week job ad", "2026-07-06", 1000, 300, "Permanent"),
    ];
    const week = buildWeekPlan(posts, WED);
    const monday = week.find(d => d.dayName === "Monday");
    expect(monday.slot).toBe("posted");
    expect(monday.posted).toEqual([{ label: "Permanent", postName: "This week job ad" }]);

    const jobDays = week.filter(d => d.slot === "job");
    expect(jobDays).toHaveLength(1); // only the Contract slot is left this week
    expect(jobDays[0].dayName).toBe("Thursday");
    expect(jobDays[0].roleLabel).toBe("Contract");
  });

  it("keeps the gap from an already-posted job ad this week, not just among newly suggested days", () => {
    const posts = [
      // Already posted a job ad this Monday.
      post("This week job ad", "2026-07-06", 1000, 300, "Permanent"),
      // Historical: job ads do great on Wednesday — but that's only one clear
      // day after Monday, too close under the spacing rule.
      post("Hiring Wed 1", "2026-06-03", 1000, 500, "job posting"),
      post("Hiring Wed 2", "2026-06-10", 1000, 500, "job posting"),
    ];
    const week = buildWeekPlan(posts, WED);
    const wednesday = week.find(d => d.dayName === "Wednesday");
    expect(wednesday.slot).not.toBe("job"); // too close to Monday's job ad, despite the best track record
  });

  it("shows a day as planned (not yet posted) when the planner has it scheduled", () => {
    const plannedItems = [
      { content_type: "Testimonial", planned_date: "2026-07-09", idea: "Client story", status: "planned" }, // this Thursday
    ];
    const week = buildWeekPlan([], { ...WED, plannedItems });
    const thursday = week.find(d => d.dayName === "Thursday");
    expect(thursday.slot).toBe("planned");
    expect(thursday.planned).toEqual([{ label: "Testimonial", idea: "Client story" }]);
    expect(thursday.confident).toBe(true);
  });

  it("lets a real post override a planned item on the same day", () => {
    const posts = [post("Actual post", "2026-07-09", 500, 50, "tips")]; // this Thursday
    const plannedItems = [
      { content_type: "Testimonial", planned_date: "2026-07-09", idea: "Client story", status: "planned" },
    ];
    const week = buildWeekPlan(posts, { ...WED, plannedItems });
    const thursday = week.find(d => d.dayName === "Thursday");
    expect(thursday.slot).toBe("posted");
    expect(thursday.posted).toEqual([{ label: "Tips", postName: "Actual post" }]);
  });

  it("excludes a content type already planned this week from the remaining days' suggestions", () => {
    const posts = [
      // Historical: testimonials are the strongest Friday content, tips second.
      post("Story Fri 1", "2026-06-05", 1000, 300, "testimonial"),
      post("Story Fri 2", "2026-06-12", 1000, 300, "testimonial"),
      post("Tips Fri 1", "2026-06-19", 1000, 150, "tips"),
      post("Tips Fri 2", "2026-06-26", 1000, 150, "tips"),
    ];
    // Already planned (not yet posted) a testimonial for this Monday.
    const plannedItems = [
      { content_type: "Testimonial", planned_date: "2026-07-06", idea: "Monday story", status: "planned" },
    ];
    const week = buildWeekPlan(posts, { ...WED, plannedItems });
    const monday = week.find(d => d.dayName === "Monday");
    expect(monday.slot).toBe("planned");
    const friday = week.find(d => d.dayName === "Friday");
    expect(friday.slot).toBe("content");
    expect(friday.bestType.label).toBe("Tips");
  });

  it("reduces the remaining job-ad slots when one's already planned (not posted) this week", () => {
    const posts = [
      // Historical: job ads perform best on Thursday.
      post("Hiring Thu 1", "2026-06-04", 1000, 300, "job posting"),
      post("Hiring Thu 2", "2026-06-11", 1000, 300, "job posting"),
    ];
    const plannedItems = [
      { content_type: "Job Posting", planned_date: "2026-07-06", idea: "Perm ad", status: "planned" }, // this Monday
    ];
    const week = buildWeekPlan(posts, { ...WED, plannedItems });
    const monday = week.find(d => d.dayName === "Monday");
    expect(monday.slot).toBe("planned");

    const jobDays = week.filter(d => d.slot === "job");
    expect(jobDays).toHaveLength(1); // only one job slot is left this week
    expect(jobDays[0].dayName).toBe("Thursday");
  });

  it("ignores planner items that aren't in 'planned' status", () => {
    const plannedItems = [
      { content_type: "Testimonial", planned_date: "2026-07-09", idea: "Just an idea", status: "idea" },
      { content_type: "Tips", planned_date: "2026-07-10", idea: "Already posted", status: "posted" },
    ];
    const week = buildWeekPlan([], { ...WED, plannedItems });
    expect(week.find(d => d.dayName === "Thursday").slot).not.toBe("planned");
    expect(week.find(d => d.dayName === "Friday").slot).not.toBe("planned");
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

describe("buildContentFreshness", () => {
  it("flags a type as stale once it's gone well past its own usual gap", () => {
    const posts = [
      // Testimonial normally goes out every ~10 days, but it's been 30 since.
      post("T1", "2026-05-01", 1000, 100, "testimonial"),
      post("T2", "2026-05-11", 1000, 100, "testimonial"),
      post("T3", "2026-05-21", 1000, 100, "testimonial"),
      // Tips post regularly and recently — not stale.
      post("Ti1", "2026-06-08", 1000, 100, "tips"),
      post("Ti2", "2026-06-18", 1000, 100, "tips"),
      post("Ti3", "2026-06-19", 1000, 100, "tips"),
    ];
    const freshness = buildContentFreshness(posts, { now: new Date(2026, 5, 20) });
    const testimonial = freshness.rows.find(r => r.label === "Testimonial");
    const tips = freshness.rows.find(r => r.label === "Tips");
    expect(testimonial.avgGap).toBeCloseTo(10, 5);
    expect(testimonial.daysSinceLast).toBe(30); // May 21 -> Jun 20
    expect(testimonial.stale).toBe(true);
    expect(tips.stale).toBe(false);
  });

  it("floors the staleness bar so a type posted once isn't flagged over a short gap", () => {
    const posts = [post("V1", "2026-06-01", 1000, 100, "video")];
    // Only 10 days since the one and only post — under the 14-day floor.
    const freshness = buildContentFreshness(posts, { now: new Date(2026, 5, 11) });
    expect(freshness.rows.find(r => r.label === "Video").stale).toBe(false);
  });

  it("still flags a single-post type once it's well past the floored threshold", () => {
    const posts = [post("V1", "2026-06-01", 1000, 100, "video")];
    // 40 days since the only post, well past the 2x14=28 day floor.
    const freshness = buildContentFreshness(posts, { now: new Date(2026, 6, 11) });
    expect(freshness.rows.find(r => r.label === "Video").stale).toBe(true);
  });

  it("returns no rows when there are no dated posts", () => {
    expect(buildContentFreshness([]).rows).toEqual([]);
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

  it("weights recent posts more heavily in a type's engagement rate", () => {
    // An old weak post and a recent strong post of the same type.
    const posts = [
      post("Old blog", "2026-01-01", 1000, 50,  "blog"), // 5%, ~5.5 months old
      post("New blog", "2026-06-15", 1000, 300, "blog"), // 30%, recent
    ];
    const flat     = buildContentMix(posts, { now: null }).rows[0];           // no weighting
    const weighted = buildContentMix(posts, { now: new Date(2026, 5, 20) }).rows[0];
    expect(flat.avgEngagementRate).toBeCloseTo(0.175, 3);   // plain impression-weighted mean
    expect(weighted.avgEngagementRate).toBeGreaterThan(0.25); // pulled toward the recent 30%
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
