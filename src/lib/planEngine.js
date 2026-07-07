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

// ─── Time-of-day ─────────────────────────────────────────────────────
// post_time is an optional "HH:MM" (24h) string, set when a post is logged
// (see SocialForm.jsx). Older/back-filled rows without one just don't count
// toward this — no penalty, no guess.
export const TIME_BUCKETS = [
  { key: "early_morning",  label: "Early Morning (6–9am)",    startHour: 6,  endHour: 9  },
  { key: "late_morning",   label: "Late Morning (9am–12pm)",  startHour: 9,  endHour: 12 },
  { key: "afternoon",      label: "Afternoon (12–3pm)",       startHour: 12, endHour: 15 },
  { key: "late_afternoon", label: "Late Afternoon (3–6pm)",   startHour: 15, endHour: 18 },
  { key: "evening",        label: "Evening (6pm+)",           startHour: 18, endHour: 24 },
];

// Anything before 6am folds into Evening (previous night's window) rather
// than a sixth sparse bucket — off-hours posts are rare enough not to need one.
export function classifyTimeOfDay(post_time) {
  if (typeof post_time !== "string") return null;
  const m = post_time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  const bucket = TIME_BUCKETS.find(b => hour >= b.startHour && hour < b.endHour) || TIME_BUCKETS[TIME_BUCKETS.length - 1];
  return { key: bucket.key, label: bucket.label };
}

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
const byRankDesc = (a, b) => (b.rankScore ?? -1) - (a.rankScore ?? -1);

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
  // Time-of-day is optional (post_time may be unset on older/back-filled
  // rows), so this bucket set can legitimately come back empty.
  const timeBuckets = groupAndScore(valid, p => classifyTimeOfDay(p.post_time), { now }).sort(byRateDesc);

  // Recency-weighted overall baseline, so "vs overall" in the narrative
  // compares like-for-like against the weighted type/day rates.
  const totalWImp = typeBuckets.reduce((a, b) => a + b.wImp, 0);
  const totalWEng = typeBuckets.reduce((a, b) => a + b.wEng, 0);
  const overallRate = engagementRate(totalWImp, totalWEng);

  const qualifiedDays  = dayBuckets.filter(b => b.count >= MIN_SAMPLE_SIZE && b.avgEngagementRate !== null);
  const qualifiedTypes = typeBuckets.filter(b => b.count >= MIN_SAMPLE_SIZE && b.avgEngagementRate !== null);
  const qualifiedTimes = timeBuckets.filter(b => b.count >= MIN_SAMPLE_SIZE && b.avgEngagementRate !== null);

  const bestDay  = qualifiedDays[0]  || null;
  const bestType = qualifiedTypes[0] || null;
  const bestTime = qualifiedTimes[0] || null;

  const todayIdx = todayWeekdayIndex(now);
  const todayBucket = dayBuckets.find(b => b.key === todayIdx) || null;

  // Time-of-day is a bonus signal, not a gate — confidence stays keyed to
  // day+type so it doesn't dip just because post_time hasn't been logged yet.
  const confidence = bestDay && bestType ? "high" : bestDay || bestType ? "medium" : "low";

  return {
    status: "ready",
    sampleSize: valid.length,
    overallRate,
    todayName: DAY_NAMES[todayIdx],
    todayBucket,
    bestDay,
    bestType,
    bestTime,
    dayBreakdown: dayBuckets,
    typeBreakdown: typeBuckets,
    timeBreakdown: timeBuckets,
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

// Job ads can't run back-to-back or with just one rest day between — at
// least two clear days must separate any two job-ad days in the week
// (permanent and contract count the same for this rule). Expressed as a
// minimum weekday-index gap: two clear days between index a and b means
// |a - b| > JOB_AD_MIN_GAP_DAYS.
export const JOB_AD_MIN_GAP_DAYS = 2;
function hasMinJobGap(a, b) {
  return Math.abs(a - b) > JOB_AD_MIN_GAP_DAYS;
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
    const score = (cell.rankScore ?? cell.avgEngagementRate ?? 0) + sub.score;
    if (score > best.score) best = { score, picks: { ...sub.picks, [day]: cell } };
  }
  return best;
}

// ─── Cross-page signal bias ─────────────────────────────────────────
// buildWeekPlan's day-by-day picks are ranked on track record alone by
// default. Passing a signal from planSignals.js (platformFocus, jobAdSignal,
// webFunnel) nudges that ranking toward types with a real (weighted) tie to
// the signal — without changing the `avgEngagementRate`/`rate` shown to the
// user, which always stays the true historical number. Each boost is capped
// well under 2x so a strong track record can't be buried by a secondary
// signal, and every signal defaults to a no-op ("empty"/null) weight of 0,
// so calling buildWeekPlan without them behaves exactly as before.
export const PLATFORM_FOCUS_BOOST = 0.15;
export const LINK_BIAS_BOOST = 0.15;
export const JOB_BOOST_MAX = 0.2;

// Weighted share (0..1) of each keyFn bucket's own posts that satisfy `test`,
// using the same recency weighting as groupAndScore so a handful of old
// posts can't swing a bucket's bias as much as a recent one would.
function weightedShare(posts, keyFn, test, { now, halfLife = RECENCY_HALF_LIFE_DAYS } = {}) {
  const nowTs = now ? startOfDay(now) : null;
  const totals = new Map();
  for (const p of posts) {
    const meta = keyFn(p);
    if (!meta) continue;
    const w = recencyWeight(p.post_date, nowTs, halfLife) * (Number(p.impressions) || 0);
    if (!totals.has(meta.key)) totals.set(meta.key, { w: 0, wMatch: 0 });
    const t = totals.get(meta.key);
    t.w += w;
    if (test(p)) t.wMatch += w;
  }
  const shares = new Map();
  for (const [key, t] of totals) shares.set(key, t.w > 0 ? t.wMatch / t.w : 0);
  return shares;
}

// A recommended Mon–Fri schedule: up to JOB_AD_SLOTS job-ad days (labeled
// permanent / contract) placed to maximize the week's total expected
// engagement — at least JOB_AD_MIN_GAP_DAYS clear days apart from each other
// and from any job ad already posted/planned this week — with the remaining
// days filled by the best *distinct* content types for variety. Rates are
// recency-weighted via `now`.
//
// Days already posted *this calendar week* (matched by exact date, not just
// weekday) show what actually went out instead of a suggestion. Days already
// scheduled in the Planner board (plannedItems: status "planned", not yet
// posted) show that instead — a placeholder, not a duplicate suggestion.
// Days that are already past with nothing logged or planned are flagged as
// missed. The plan for what's left is adjusted so it doesn't repeat a
// job-ad slot or content type already posted or planned earlier this week.
export function buildWeekPlan(posts, {
  now = new Date(), minPerCell = 2, plannedItems = [],
  platformFocus = null, jobAdSignal = null, webFunnel = null,
} = {}) {
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

  // A day with a real post is settled; only look to the planner for days
  // that haven't actually gone out yet.
  const plannedByDay = {};
  for (const dayIndex of WEEKDAYS) {
    if (postedByDay[dayIndex]) { plannedByDay[dayIndex] = null; continue; }
    const dateStr = weekDates[dayIndex];
    const items = (plannedItems || []).filter(it => it.status === "planned" && it.planned_date === dateStr);
    plannedByDay[dayIndex] = items.length ? items : null;
  }

  // What's already covered this week — posted or planned — so the rest of
  // the week doesn't repeat a job-ad slot or content type already spoken for.
  // usedJobDays also records *which* weekdays those job ads landed on, so a
  // newly suggested job day can be checked against them for the minimum gap.
  const usedTypesThisWeek = new Set();
  const usedJobRoles = new Set();
  const usedJobDays = [];
  let jobSlotsUsedThisWeek = 0;
  const markUsed = (label, dayIndex) => {
    if (!label) return;
    if (isJobAdType(label)) {
      jobSlotsUsedThisWeek += 1;
      usedJobDays.push(dayIndex);
      const l = label.toLowerCase();
      if (l.includes("perm")) usedJobRoles.add("Permanent");
      else if (l.includes("contract")) usedJobRoles.add("Contract");
    } else {
      usedTypesThisWeek.add(label.toLowerCase());
    }
  };
  for (const dayIndex of WEEKDAYS) {
    for (const p of postedByDay[dayIndex] || []) markUsed(classifyPost(p).label, dayIndex);
    for (const it of plannedByDay[dayIndex] || []) markUsed(it.content_type, dayIndex);
  }

  const todayOffset = mondayOffset(now.getDay());
  const remainingDays = WEEKDAYS.filter(d => !postedByDay[d] && !plannedByDay[d] && mondayOffset(d) >= todayOffset);

  // Per remaining day: the aggregated job-ad track record, and the ranked
  // non-job cells (types already used this week excluded, for variety).
  const jobByDay = {};
  const contentByDay = {};
  for (const dayIndex of remainingDays) {
    const dayPosts = valid.filter(p => dayOfWeekIndex(p.post_date) === dayIndex);
    const jobPosts = dayPosts.filter(p => isJobAdType(classifyPost(p).label));
    const nonJobPosts = dayPosts.filter(p => !isJobAdType(classifyPost(p).label));

    const jobAgg = groupAndScore(jobPosts, () => ({ key: "job" }), { now })[0] || null;
    const jobRate = jobAgg?.avgEngagementRate ?? null;
    const jobRankRate = jobAdSignal?.status === "ready" && jobRate !== null
      ? jobRate * (1 + JOB_BOOST_MAX * jobAdSignal.weight)
      : jobRate;
    jobByDay[dayIndex] = { rate: jobRate, rankRate: jobRankRate, count: jobAgg?.count ?? 0 };

    const platformShares = platformFocus?.status === "ready"
      ? weightedShare(nonJobPosts, classifyPost, p => (p.platforms || "").toLowerCase().includes(platformFocus.platform.toLowerCase()), { now })
      : null;
    const linkedShares = webFunnel?.status === "ready"
      ? weightedShare(nonJobPosts, classifyPost, p => !!String(p.url || "").trim(), { now })
      : null;

    contentByDay[dayIndex] = groupAndScore(nonJobPosts, classifyPost, { now })
      .filter(b => b.avgEngagementRate !== null && !usedTypesThisWeek.has(b.label.toLowerCase()))
      .map(b => {
        let rankScore = b.avgEngagementRate;
        if (platformShares) rankScore *= 1 + PLATFORM_FOCUS_BOOST * platformFocus.weight * platformShares.get(b.key);
        if (linkedShares) rankScore *= 1 + LINK_BIAS_BOOST * webFunnel.weight * linkedShares.get(b.key);
        return { ...b, rankScore };
      })
      .sort(byRankDesc);
  }

  const jobSlotsRemaining = Math.max(0, JOB_AD_SLOTS - jobSlotsUsedThisWeek);
  const roleLabelsRemaining = usedJobRoles.size
    ? JOB_ROLE_LABELS.filter(r => !usedJobRoles.has(r))
    : JOB_ROLE_LABELS;

  // A candidate set of new job days is only legal if every pair keeps the
  // minimum gap from each other, *and* from any job ad already posted or
  // planned earlier this week — a day that's fine on its own can still be
  // too close to Monday's job ad, for instance.
  const jobDaysValid = (jobDays) => {
    for (let i = 0; i < jobDays.length; i++) {
      for (let j = i + 1; j < jobDays.length; j++) {
        if (!hasMinJobGap(jobDays[i], jobDays[j])) return false;
      }
    }
    return jobDays.every(d => usedJobDays.every(u => hasMinJobGap(d, u)));
  };

  // Job ads are a fixed obligation, so the full remaining quota is placed
  // whenever geometrically possible — but the gap rule can make the full
  // count infeasible this late in the week (e.g. only 3 days left can't fit
  // 2 job days 2+ days apart). Find the largest count that's still legal,
  // then, among placements of that size, keep the split that maximizes
  // total expected engagement (job days score their job rate, the rest get
  // the best distinct-content assignment).
  const maxJobK = Math.min(jobSlotsRemaining, remainingDays.length);
  let feasibleK = 0;
  for (let k = maxJobK; k >= 0; k--) {
    if (combinations(remainingDays, k).some(jobDaysValid)) { feasibleK = k; break; }
  }

  let bestPlan = null;
  for (const jobDays of combinations(remainingDays, feasibleK)) {
    if (!jobDaysValid(jobDays)) continue;
    const contentDays = remainingDays.filter(d => !jobDays.includes(d));
    const jobScore = jobDays.reduce((a, d) => a + (jobByDay[d].rankRate ?? jobByDay[d].rate ?? 0), 0);
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
        confident: true, recommendBoost: false,
      };
    }
    const dayPlanned = plannedByDay[dayIndex];
    if (dayPlanned) {
      return {
        dayIndex, dayName: DAY_NAMES[dayIndex], slot: "planned", roleLabel: null, bestType: null,
        planned: dayPlanned.map(it => ({ label: it.content_type || "Planned", idea: it.idea || "" })),
        confident: true, recommendBoost: false,
      };
    }
    if (mondayOffset(dayIndex) < todayOffset) {
      return { dayIndex, dayName: DAY_NAMES[dayIndex], slot: "missed", roleLabel: null, bestType: null, confident: false, recommendBoost: false };
    }
    if (bestPlan.jobDays.includes(dayIndex)) {
      const job = jobByDay[dayIndex];
      return {
        dayIndex, dayName: DAY_NAMES[dayIndex], slot: "job", roleLabel: roleByDay[dayIndex],
        bestType: { label: "Job Posting", count: job.count, avgEngagementRate: job.rate },
        confident: job.count >= minPerCell,
        recommendBoost: jobAdSignal?.status === "ready",
      };
    }
    const cell = bestPlan.picks[dayIndex] || null;
    return {
      dayIndex, dayName: DAY_NAMES[dayIndex], slot: "content", roleLabel: null,
      bestType: cell ? { label: cell.label, count: cell.count, avgEngagementRate: cell.avgEngagementRate } : null,
      confident: !!cell && cell.count >= minPerCell,
      recommendBoost: false,
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

// Content freshness — how long since each content type last went out, so a
// format that's quietly dropped off (even one that once performed well)
// gets flagged instead of just fading from view. Each type's own average
// gap between posts sets its own staleness bar — a format that normally
// goes out every ~10 days is stale at 20; one that's normally every ~30
// days isn't stale until well past that — rather than one fixed threshold
// for every type. FRESHNESS_MIN_GAP_DAYS floors that bar so a type posted
// only once or twice isn't flagged over a single fluke gap.
export const FRESHNESS_STALE_MULTIPLIER = 2;
export const FRESHNESS_MIN_GAP_DAYS = 14;

export function buildContentFreshness(posts, { now = new Date() } = {}) {
  const valid = (posts || []).filter(p => p.post_date);
  const byType = new Map();
  for (const p of valid) {
    const t = dateToLocalTs(p.post_date);
    if (t === null) continue;
    const { key, label } = classifyPost(p);
    if (!byType.has(key)) byType.set(key, { key, label, dates: [] });
    byType.get(key).dates.push(t);
  }

  const today = startOfDay(now);
  const rows = [...byType.values()].map(({ key, label, dates }) => {
    dates.sort((a, b) => a - b);
    const count = dates.length;
    const last = dates[count - 1];
    const daysSinceLast = Math.max(0, Math.round((today - last) / DAY_MS));
    let avgGap = null;
    if (count >= 2) {
      let totalGap = 0;
      for (let i = 1; i < count; i++) totalGap += dates[i] - dates[i - 1];
      avgGap = totalGap / DAY_MS / (count - 1);
    }
    const staleThreshold = Math.max(FRESHNESS_MIN_GAP_DAYS, (avgGap ?? FRESHNESS_MIN_GAP_DAYS) * FRESHNESS_STALE_MULTIPLIER);
    return { key, label, count, daysSinceLast, avgGap, stale: daysSinceLast > staleThreshold };
  }).sort((a, b) => b.daysSinceLast - a.daysSinceLast);

  return { rows };
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

  if (plan.bestTime) {
    parts.push(`${plan.bestTime.label} is the strongest time slot — averaging ${pct(plan.bestTime.avgEngagementRate)} engagement.`);
  }

  if (!plan.bestType && !plan.bestDay) {
    parts.push(`Not enough posts logged yet this quarter to find a reliable pattern — each bucket needs at least ${MIN_SAMPLE_SIZE} posts. Log more of the post log to unlock this.`);
  }

  return parts.join(" ");
}
