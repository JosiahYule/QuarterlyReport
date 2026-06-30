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

// The known content-type vocabulary, exposed so the planner's type picker
// offers the same labels the classifier uses (free text is still allowed).
export const SUGGESTED_CONTENT_TYPES = [...FALLBACK_CATEGORIES.map(c => c.label), OTHER_LABEL];

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

// ─── Week plan (Mon–Fri) ────────────────────────────────────────────
// The work week, so a "what do I post today" question always has a row.
export const WEEKDAYS = [1, 2, 3, 4, 5];

// For each weekday, the content type that has historically performed best
// *when posted on that day* — a per-day version of the content-type
// breakdown above. These day×type cells are far sparser than either
// marginal (a single day only sees a slice of each type's posts), so the
// minimum is lower than MIN_SAMPLE_SIZE: a type is "confident" once it
// clears minPerCell, and below that the leading type is still surfaced but
// flagged thin so one lucky post doesn't masquerade as a pattern. Days with
// no posts at all return bestType: null.
export function buildWeekPlan(posts, { minPerCell = 2 } = {}) {
  const valid = (posts || []).filter(p => p.post_date && Number(p.impressions) > 0);
  return WEEKDAYS.map(dayIndex => {
    const dayPosts = valid.filter(p => dayOfWeekIndex(p.post_date) === dayIndex);
    const types = groupAndScore(dayPosts, classifyPost)
      .filter(b => b.avgEngagementRate !== null)
      .sort(byRateDesc);
    const qualified = types.filter(b => b.count >= minPerCell);
    const bestType = qualified[0] || types[0] || null;
    return {
      dayIndex,
      dayName: DAY_NAMES[dayIndex],
      postCount: dayPosts.length,
      bestType,
      confident: !!bestType && bestType.count >= minPerCell,
    };
  });
}

// ─── Hub modules ────────────────────────────────────────────────────
// The pieces below turn the Plan tab into a manager's command center.
// All are pure reads over the same post log — no LLM, no persistence.
const DAY_MS = 86400000;

function dateToLocalTs(dateStr) {
  if (typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Roll up a set of posts into headline totals. Shared by the scorecard and
// content-mix modules so they agree on what "this quarter" adds up to.
function aggregate(posts) {
  const valid = (posts || []).filter(p => p.post_date && Number(p.impressions) > 0);
  const impressions = valid.reduce((a, p) => a + (Number(p.impressions) || 0), 0);
  const engagements = valid.reduce((a, p) => a + (Number(p.engagements) || 0), 0);
  return { postCount: valid.length, impressions, engagements, rate: engagementRate(impressions, engagements) };
}

function relDelta(cur, prev) {
  return Number.isFinite(cur) && Number.isFinite(prev) && prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

// Scorecard — this quarter's headline numbers, each with a quarter-over-
// quarter delta so momentum reads at a glance. delta is null when there's
// no comparable prior-quarter figure (so the UI shows no arrow rather than
// a misleading one).
export function buildScorecard(currentPosts, prevPosts) {
  const cur = aggregate(currentPosts);
  const prev = aggregate(prevPosts);
  return {
    hasPrev: prev.postCount > 0,
    metrics: [
      { key: "posts",       label: "Posts",           value: cur.postCount,   delta: relDelta(cur.postCount, prev.postCount),     format: "int" },
      { key: "engagement",  label: "Avg. engagement", value: cur.rate,        delta: relDelta(cur.rate, prev.rate),               format: "pct" },
      { key: "impressions", label: "Impressions",     value: cur.impressions, delta: relDelta(cur.impressions, prev.impressions), format: "int" },
      { key: "engagements", label: "Engagements",     value: cur.engagements, delta: relDelta(cur.engagements, prev.engagements), format: "int" },
    ],
  };
}

// Cadence — how consistently posts are going out within a quarter window.
// quarterStart/quarterEnd (Date objects) bound the posts-per-week pace to
// the quarter being viewed; without them it falls back to first-post→today.
// daysSinceLast and the "gone dark" flag are measured against today (clamped
// to the quarter end, so a past quarter reports how early posting tailed off
// rather than how long ago the quarter was).
export function buildCadence(posts, { now = new Date(), quarterStart = null, quarterEnd = null, darkThreshold = 7 } = {}) {
  const times = (posts || [])
    .map(p => (p.post_date ? dateToLocalTs(p.post_date) : null))
    .filter(t => t !== null)
    .sort((a, b) => a - b);
  if (!times.length) return { status: "empty" };

  const today = startOfDay(now);
  const last = times[times.length - 1];
  const endClamp = quarterEnd ? Math.min(today, startOfDay(new Date(quarterEnd.getTime() - DAY_MS))) : today;
  const refDay = Math.max(endClamp, last); // never before the most recent post
  const startTs = quarterStart ? startOfDay(quarterStart) : times[0];

  const daysSinceLast = Math.max(0, Math.round((refDay - last) / DAY_MS));
  const spanDays = Math.max(1, Math.round((refDay - startTs) / DAY_MS) + 1);
  const postsPerWeek = times.length / Math.max(1, spanDays / 7);

  let largestGap = 0;
  for (let i = 1; i < times.length; i++) {
    largestGap = Math.max(largestGap, Math.round((times[i] - times[i - 1]) / DAY_MS));
  }

  return {
    status: "ready",
    postCount: times.length,
    daysSinceLast,
    postsPerWeek,
    largestGap,
    goneDark: daysSinceLast >= darkThreshold,
  };
}

// Content mix — share of volume vs. share of performance, per type. Flags
// where the two diverge: a type that out-performs the overall rate but is
// rarely posted is an "opportunity" (post more); one that's posted a lot but
// under-performs is "overinvested" (ease off). Thresholds are deliberately
// loose so only clear divergences get a call-out.
export const MIX_OUTPERFORM   = 1.15; // ≥15% above the overall rate
export const MIX_UNDERPERFORM = 0.85; // ≤15% below the overall rate
export const MIX_HIGH_SHARE   = 0.33; // a third or more of all posts = a major chunk
export const MIX_LOW_SHARE    = 0.25; // a quarter or less = a minority you could lean into

export function buildContentMix(posts) {
  const valid = (posts || []).filter(p => p.post_date && Number(p.impressions) > 0);
  if (!valid.length) return { rows: [], overallRate: null };
  const total = valid.length;
  const overallRate = aggregate(valid).rate;
  const rows = groupAndScore(valid, classifyPost).sort(byRateDesc).map(t => {
    const share = t.count / total;
    const vsOverall = overallRate && t.avgEngagementRate != null ? t.avgEngagementRate / overallRate : null;
    let flag = "balanced";
    if (vsOverall != null) {
      if (vsOverall >= MIX_OUTPERFORM && share <= MIX_LOW_SHARE) flag = "opportunity";
      else if (vsOverall <= MIX_UNDERPERFORM && share >= MIX_HIGH_SHARE) flag = "overinvested";
    }
    return { key: t.key, label: t.label, count: t.count, share, avgEngagementRate: t.avgEngagementRate, vsOverall, flag };
  });
  return { rows, overallRate };
}

// Top & under performers — concrete posts, ranked by engagement rate, so the
// manager has real examples to repeat or rethink rather than just averages.
// bottom is only returned when there are enough posts to meaningfully
// distinguish a worst-N from the best-N.
export function buildPerformers(posts, { limit = 3 } = {}) {
  const ranked = (posts || [])
    .filter(p => p.post_date && Number(p.impressions) > 0)
    .map(p => {
      const impressions = Number(p.impressions) || 0;
      const engagements = Number(p.engagements) || 0;
      return {
        postName: p.post_name || "(untitled)",
        postDate: p.post_date,
        url: p.url || "",
        type: classifyPost(p).label,
        impressions,
        engagements,
        rate: engagementRate(impressions, engagements),
      };
    })
    .filter(p => p.rate != null)
    .sort((a, b) => b.rate - a.rate);
  return {
    total: ranked.length,
    top: ranked.slice(0, limit),
    bottom: ranked.length > limit ? ranked.slice(-limit).reverse() : [],
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
