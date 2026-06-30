// ─── Plan engine ───────────────────────────────────────────────────
// Deterministic, rule-based "what should we post today" suggestions, built
// purely from the current quarter's own post log (social_posts). No LLM,
// no randomness, no network calls — same inputs always yield the same
// suggestion, and it runs entirely client-side like the rest of the
// projection/narrative code in projection.js.
import { REPORT_TZ } from "../config.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Minimum posts a day-of-week or content-type bucket needs before its
// average engagement rate is trusted enough to drive a suggestion. Below
// this, the bucket still appears in the breakdown but is excluded from
// "best of" picks so a single lucky post can't look like a pattern.
export const MIN_SAMPLE_SIZE = 3;

// ─── Content-type classification ──────────────────────────────────
// The Notes column on the All Posts table is where the post type is
// actually recorded (e.g. "job posting", "testimonial") — so that's the
// source of truth for a post's category whenever it's filled in. Keyword
// matching against the post name is only a fallback for older/undated rows
// logged without a notes entry, so they don't all collapse into "Other".
const FALLBACK_CATEGORIES = [
  { label: "Job Posting",           keywords: ["hiring", "now hiring", "job opening", "apply now", "apply today", "we're hiring", "job alert", "career opportunity"] },
  { label: "Client/Candidate Story", keywords: ["testimonial", "success story", "spotlight", "case study", "client review", "candidate story", "placement story"] },
  { label: "Team & Culture",        keywords: ["our team", "team culture", "welcome to the team", "work anniversary", "congrat", "staff appreciation", "employee spotlight"] },
  { label: "Industry Tips/Advice",  keywords: ["tip", "tips", "advice", "how to", "resume", "interview", "guide", "checklist", "did you know"] },
  { label: "Event/Webinar",         keywords: ["webinar", "job fair", "career fair", "open house", "register now", "join us"] },
  { label: "Holiday/Seasonal",      keywords: ["happy holidays", "merry christmas", "season", "thanksgiving", "halloween", "new year", "long weekend"] },
  { label: "Company Update",        keywords: ["announce", "milestone", "award", "partnership", "proud to", "we've moved", "new office"] },
  { label: "Video",                 keywords: ["video", "watch now", "reel", "behind the scenes"] },
];
const OTHER_LABEL = "Other";

function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function classifyPost(post) {
  const noteType = (post?.notes || "").trim().replace(/\s+/g, " ");
  if (noteType) {
    const label = titleCase(noteType);
    return { key: label.toLowerCase(), label };
  }

  const text = (post?.post_name || "").toLowerCase();
  for (const cat of FALLBACK_CATEGORIES) {
    if (cat.keywords.some(k => text.includes(k))) return { key: cat.label.toLowerCase(), label: cat.label };
  }
  return { key: OTHER_LABEL.toLowerCase(), label: OTHER_LABEL };
}

// ─── Day-of-week ───────────────────────────────────────────────────
// post_date is a plain "YYYY-MM-DD" calendar date (no time component), so
// it's parsed manually into local y/m/d rather than through `new Date(str)`,
// which treats the bare string as UTC midnight and can roll the weekday
// back a day in negative-offset timezones.
export function dayOfWeekIndex(dateStr) {
  if (typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d.getDay() : null;
}

export function todayWeekdayIndex(now = new Date(), timeZone = REPORT_TZ) {
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
    const i = DAY_NAMES.indexOf(wd);
    if (i !== -1) return i;
  } catch {
    // Intl timezone data unavailable — fall through to local time
  }
  return now.getDay();
}

export { DAY_NAMES };

// ─── Bucketing ──────────────────────────────────────────────────────
function engagementRate(impressions, engagements) {
  return impressions > 0 ? engagements / impressions : null;
}

// keyFn returns { key, ...extra } (e.g. a label/name to display) or
// null/undefined to exclude the post from this grouping.
function groupAndScore(posts, keyFn) {
  const buckets = new Map();
  for (const p of posts) {
    const meta = keyFn(p);
    if (!meta) continue;
    if (!buckets.has(meta.key)) buckets.set(meta.key, { ...meta, count: 0, impressions: 0, engagements: 0 });
    const b = buckets.get(meta.key);
    b.count += 1;
    b.impressions += Number(p.impressions) || 0;
    b.engagements += Number(p.engagements) || 0;
  }
  return [...buckets.values()].map(b => ({ ...b, avgEngagementRate: engagementRate(b.impressions, b.engagements) }));
}

const byRateDesc = (a, b) => (b.avgEngagementRate ?? -1) - (a.avgEngagementRate ?? -1);

// ─── Plan suggestion ────────────────────────────────────────────────
// posts: raw social_posts rows for the report (post_name, post_date,
// platforms, impressions, engagements, notes). Only rows with a date and
// at least one impression are used — undated or zero-impression rows can't
// inform a day/content pattern.
export function buildPlanSuggestion(posts, { now = new Date() } = {}) {
  const valid = (posts || []).filter(p => p.post_date && Number(p.impressions) > 0);
  if (!valid.length) return { status: "empty" };

  const totalImpressions = valid.reduce((a, p) => a + (Number(p.impressions) || 0), 0);
  const totalEngagements = valid.reduce((a, p) => a + (Number(p.engagements) || 0), 0);
  const overallRate = engagementRate(totalImpressions, totalEngagements);

  const dayBuckets = groupAndScore(valid, p => {
    const idx = dayOfWeekIndex(p.post_date);
    return idx === null ? null : { key: idx, name: DAY_NAMES[idx] };
  }).sort(byRateDesc);
  const typeBuckets = groupAndScore(valid, classifyPost).sort(byRateDesc);

  const qualifiedDays  = dayBuckets.filter(b => b.count >= MIN_SAMPLE_SIZE && b.avgEngagementRate !== null);
  const qualifiedTypes = typeBuckets.filter(b => b.count >= MIN_SAMPLE_SIZE && b.avgEngagementRate !== null);

  const bestDay  = qualifiedDays[0]  || null;
  const bestType = qualifiedTypes[0] || null;

  const todayIdx = todayWeekdayIndex(now);
  const todayBucket = dayBuckets.find(b => b.key === todayIdx) || null;

  const confidence = bestDay && bestType ? "high" : bestDay || bestType ? "medium" : "low";

  return {
    status: "ready",
    sampleSize: valid.length,
    overallRate,
    todayName: DAY_NAMES[todayIdx],
    todayBucket,
    bestDay,
    bestType,
    dayBreakdown: dayBuckets,
    typeBreakdown: typeBuckets,
    confidence,
  };
}

// ─── Narrative ──────────────────────────────────────────────────────
// A deterministic plain-English read of the plan, same spirit as
// buildTrendsNarrative in projection.js: no LLM, no randomness, safe to
// show as-is. Returns "" when there's nothing worth saying.
function pct(rate) { return Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : null; }

export function buildPlanNarrative(plan) {
  if (!plan || plan.status !== "ready") return "";
  const parts = [];

  if (plan.bestType) {
    const overall = pct(plan.overallRate);
    parts.push(
      `${plan.bestType.label} is this quarter's top-performing content type — averaging ${pct(plan.bestType.avgEngagementRate)} engagement across ${plan.bestType.count} posts` +
      (overall ? `, vs. ${overall} overall.` : ".")
    );
  }

  if (plan.bestDay) {
    const isToday = plan.todayBucket && plan.todayBucket.key === plan.bestDay.key;
    parts.push(
      isToday
        ? `${plan.bestDay.name}s are also your strongest posting day, and today is one — the timing lines up.`
        : `${plan.bestDay.name} is historically the strongest day to post (${pct(plan.bestDay.avgEngagementRate)} avg. engagement). Today is ${plan.todayName}.`
    );
  }

  if (!plan.bestType && !plan.bestDay) {
    parts.push(`Not enough posts logged yet this quarter to find a reliable pattern — each bucket needs at least ${MIN_SAMPLE_SIZE} posts. Log more of the post log to unlock this.`);
  }

  return parts.join(" ");
}
