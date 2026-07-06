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

// Recent posts of a type predict how it'll do now better than months-old
// ones — if a format was reworked, it now performs to its new level, not its
// lifetime average. Each post's weight halves every RECENCY_HALF_LIFE_DAYS of
// age, measured from `now`. Passing no `now` disables weighting (every post
// counts equally) so plain aggregations and tests stay deterministic.
export const RECENCY_HALF_LIFE_DAYS = 45;

function recencyWeight(dateStr, nowTs, halfLife) {
  if (nowTs == null) return 1;
  const t = dateToLocalTs(dateStr);
  if (t === null) return 1;
  const ageDays = Math.max(0, (nowTs - t) / DAY_MS);
  return Math.pow(0.5, ageDays / halfLife);
}

// keyFn returns { key, ...extra } (e.g. a label/name to display) or
// null/undefined to exclude the post from this grouping. avgEngagementRate is
// impression-weighted and, when `now` is given, recency-weighted on top;
// count stays a raw post count for sample-size checks.
function groupAndScore(posts, keyFn, { now = null, halfLife = RECENCY_HALF_LIFE_DAYS } = {}) {
  const nowTs = now ? startOfDay(now) : null;
  const buckets = new Map();
  for (const p of posts) {
    const meta = keyFn(p);
    if (!meta) continue;
    const imp = Number(p.impressions) || 0;
    const eng = Number(p.engagements) || 0;
    const w = recencyWeight(p.post_date, nowTs, halfLife);
    if (!buckets.has(meta.key)) buckets.set(meta.key, { ...meta, count: 0, impressions: 0, engagements: 0, wImp: 0, wEng: 0 });
    const b = buckets.get(meta.key);
    b.count += 1;
    b.impressions += imp;
    b.engagements += eng;
    b.wImp += imp * w;
    b.wEng += eng * w;
  }
  return [...buckets.values()].map(b => ({ ...b, avgEngagementRate: engagementRate(b.wImp, b.wEng) }));
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

  const dayBuckets = groupAndScore(valid, p => {
    const idx = dayOfWeekIndex(p.post_date);
    return idx === null ? null : { key: idx, name: DAY_NAMES[idx] };
  }, { now }).sort(byRateDesc);
  const typeBuckets = groupAndScore(valid, classifyPost, { now }).sort(byRateDesc);

  // Recency-weighted overall baseline, so "vs overall" in the narrative
  // compares like-for-like against the weighted type/day rates.
  const totalWImp = typeBuckets.reduce((a, b) => a + b.wImp, 0);
  const totalWEng = typeBuckets.reduce((a, b) => a + b.wEng, 0);
  const overallRate = engagementRate(totalWImp, totalWEng);

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
export const WEEKDAYS = [1, 2, 3, 4, 5];

// Job ads are a fixed weekly obligation — one permanent, one contract — and
// shouldn't crowd out variety, so the week plan reserves at most
// JOB_AD_SLOTS days for them and fills the rest with *distinct* other
// content types for diversity. A post counts as a job ad when its type label
// looks like one (covers "Job Posting", "Job Ad", perm/contract tags, etc.).
export const JOB_AD_SLOTS = 2;
export const JOB_ROLE_LABELS = ["Permanent", "Contract"];
const JOB_AD_KEYWORDS = ["job", "hiring", "perm", "contract", "vacanc"];

export function isJobAdType(label) {
  const l = (label || "").toLowerCase();
  return JOB_AD_KEYWORDS.some(k => l.includes(k));
}

// Days since Monday (0=Mon..6=Sun) for a JS getDay()-style weekday index
// (0=Sun..6=Sat). Lets a weekday be placed within its Mon-start week and
// tells whether "today" has already passed a given weekday this week —
// including when today itself is the Sat/Sun after that week's Mon-Fri.
function mondayOffset(weekdayIdx) {
  return (weekdayIdx + 6) % 7;
}

// Calendar date ("YYYY-MM-DD") of each Mon-Fri weekday in the week
// containing `now`, so posts already logged this week can be matched to the
// plan by actual date rather than just weekday name. Uses `now`'s plain
// local date parts — same convention as dateToLocalTs/startOfDay above —
// rather than an Intl timezone conversion, so a midnight `now` (as tests
// construct) can't roll onto a different calendar day than intended.
export function thisWeekDates(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset(now.getDay()));
  const out = {};
  for (const dayIndex of WEEKDAYS) {
    const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (dayIndex - 1));
    out[dayIndex] = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  return out;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...tail] = arr;
  return [
    ...combinations(tail, k - 1).map(c => [head, ...c]),
    ...combinations(tail, k),
  ];
}

// Max-weight assignment of distinct content types to days — each type used at
// most once across the given days, so the non-job days stay diverse. Exact
// search over tiny inputs (≤3 days); cells are pre-sorted by rate so ties
// resolve deterministically.
function assignDistinct(days, cellsByDay) {
  if (!days.length) return { score: 0, picks: {} };
  const [day, ...rest] = days;
  const cells = cellsByDay[day] || [];
  // Baseline: leave this day open, assign the rest optimally.
  const skip = assignDistinct(rest, cellsByDay);
  let best = { score: skip.score, picks: { ...skip.picks, [day]: null } };
  for (const cell of cells) {
    const remaining = {};
    for (const d of rest) remaining[d] = (cellsByDay[d] || []).filter(c => c.key !== cell.key);
    const sub = assignDistinct(rest, remaining);
    const score = (cell.avgEngagementRate ?? 0) + sub.score;
    if (score > best.score) best = { score, picks: { ...sub.picks, [day]: cell } };
  }
  return best;
}

// A recommended Mon–Fri schedule: up to JOB_AD_SLOTS job-ad days (labeled
// permanent / contract) placed to maximize the week's total expected
// engagement, with the remaining days filled by the best *distinct* content
// types for variety. Rates are recency-weighted via `now`.
//
// Days already posted *this calendar week* (matched by exact date, not just
// weekday) show what actually went out instead of a suggestion, and don't
// factor into the remaining days' plan. Days that are already past with
// nothing logged are flagged as missed rather than re-suggested. The plan
// for what's left is adjusted so it doesn't repeat a job-ad slot or content
// type already covered earlier this week.
export function buildWeekPlan(posts, { now = new Date(), minPerCell = 2 } = {}) {
  const allPosts = posts || [];
  const valid = allPosts.filter(p => p.post_date && Number(p.impressions) > 0);

  // Any logged post counts as "already posted" (even before impressions are
  // in) — this is "did I already post," not "how did it perform."
  const weekDates = thisWeekDates(now);
  const postedByDay = {};
  for (const dayIndex of WEEKDAYS) {
    const dayPosts = allPosts.filter(p => p.post_date === weekDates[dayIndex]);
    postedByDay[dayIndex] = dayPosts.length ? dayPosts : null;
  }

  // What's already covered this week, so the rest of the week doesn't repeat
  // a job-ad slot or content type that's already gone out.
  const usedTypesThisWeek = new Set();
  const usedJobRoles = new Set();
  let jobSlotsUsedThisWeek = 0;
  for (const dayIndex of WEEKDAYS) {
    for (const p of postedByDay[dayIndex] || []) {
      const label = classifyPost(p).label;
      if (isJobAdType(label)) {
        jobSlotsUsedThisWeek += 1;
        const l = label.toLowerCase();
        if (l.includes("perm")) usedJobRoles.add("Permanent");
        else if (l.includes("contract")) usedJobRoles.add("Contract");
      } else {
        usedTypesThisWeek.add(label.toLowerCase());
      }
    }
  }

  const todayOffset = mondayOffset(now.getDay());
  const remainingDays = WEEKDAYS.filter(d => !postedByDay[d] && mondayOffset(d) >= todayOffset);

  // Per remaining day: the aggregated job-ad track record, and the ranked
  // non-job cells (types already used this week excluded, for variety).
  const jobByDay = {};
  const contentByDay = {};
  for (const dayIndex of remainingDays) {
    const dayPosts = valid.filter(p => dayOfWeekIndex(p.post_date) === dayIndex);
    const jobPosts = dayPosts.filter(p => isJobAdType(classifyPost(p).label));
    const jobAgg = groupAndScore(jobPosts, () => ({ key: "job" }), { now })[0] || null;
    jobByDay[dayIndex] = { rate: jobAgg?.avgEngagementRate ?? null, count: jobAgg?.count ?? 0 };
    contentByDay[dayIndex] = groupAndScore(dayPosts.filter(p => !isJobAdType(classifyPost(p).label)), classifyPost, { now })
      .filter(b => b.avgEngagementRate !== null && !usedTypesThisWeek.has(b.label.toLowerCase()))
      .sort(byRateDesc);
  }

  const jobSlotsRemaining = Math.max(0, JOB_AD_SLOTS - jobSlotsUsedThisWeek);
  const roleLabelsRemaining = usedJobRoles.size
    ? JOB_ROLE_LABELS.filter(r => !usedJobRoles.has(r))
    : JOB_ROLE_LABELS;

  // Try every choice of which remaining days carry the remaining job ads;
  // keep the split that maximizes total expected engagement (job days score
  // their job rate, the rest get the best distinct-content assignment).
  let bestPlan = null;
  const jobK = Math.min(jobSlotsRemaining, remainingDays.length);
  for (const jobDays of combinations(remainingDays, jobK)) {
    const contentDays = remainingDays.filter(d => !jobDays.includes(d));
    const jobScore = jobDays.reduce((a, d) => a + (jobByDay[d].rate ?? 0), 0);
    const { score: contentScore, picks } = assignDistinct(contentDays, contentByDay);
    const total = jobScore + contentScore;
    if (!bestPlan || total > bestPlan.total) bestPlan = { total, jobDays, picks };
  }
  if (!bestPlan) bestPlan = { total: 0, jobDays: [], picks: {} };

  const roleByDay = {};
  [...bestPlan.jobDays].sort((a, b) => a - b).forEach((d, i) => {
    roleByDay[d] = roleLabelsRemaining[i] || `Job ad ${i + 1}`;
  });

  return WEEKDAYS.map(dayIndex => {
    const dayPosts = postedByDay[dayIndex];
    if (dayPosts) {
      return {
        dayIndex, dayName: DAY_NAMES[dayIndex], slot: "posted", roleLabel: null, bestType: null,
        posted: dayPosts.map(p => ({ label: classifyPost(p).label, postName: p.post_name || "" })),
        confident: true,
      };
    }
    if (mondayOffset(dayIndex) < todayOffset) {
      return { dayIndex, dayName: DAY_NAMES[dayIndex], slot: "missed", roleLabel: null, bestType: null, confident: false };
    }
    if (bestPlan.jobDays.includes(dayIndex)) {
      const job = jobByDay[dayIndex];
      return {
        dayIndex, dayName: DAY_NAMES[dayIndex], slot: "job", roleLabel: roleByDay[dayIndex],
        bestType: { label: "Job Posting", count: job.count, avgEngagementRate: job.rate },
        confident: job.count >= minPerCell,
      };
    }
    const cell = bestPlan.picks[dayIndex] || null;
    return {
      dayIndex, dayName: DAY_NAMES[dayIndex], slot: "content", roleLabel: null,
      bestType: cell ? { label: cell.label, count: cell.count, avgEngagementRate: cell.avgEngagementRate } : null,
      confident: !!cell && cell.count >= minPerCell,
    };
  });
}

// ─── Hub modules ────────────────────────────────────────────────────
// The pieces below turn the Plan tab into a manager's command center.
// All are pure reads over the same post log — no LLM, no persistence.

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

export function buildContentMix(posts, { now = new Date() } = {}) {
  const valid = (posts || []).filter(p => p.post_date && Number(p.impressions) > 0);
  if (!valid.length) return { rows: [], overallRate: null };
  const total = valid.length;
  const buckets = groupAndScore(valid, classifyPost, { now }).sort(byRateDesc);
  // Recency-weighted overall baseline, consistent with the per-type rates.
  const overallRate = engagementRate(
    buckets.reduce((a, b) => a + b.wImp, 0),
    buckets.reduce((a, b) => a + b.wEng, 0),
  );
  const rows = buckets.map(t => {
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
