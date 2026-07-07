// ─── Cross-page signals ─────────────────────────────────────────────
// Pure, deterministic reads over data the Social and Website reports
// already collect (platform standings, paid media, web funnel KPIs) —
// same house style as planEngine.js: no LLM, no randomness, and no
// signal at all ("empty") when there isn't enough evidence to trust one.
// These feed buildWeekPlan's day-by-day ranking as a bounded nudge, not
// a fabricated recommendation, so `weight` is always 0..1 and callers
// can pass an "empty" signal straight through with no special-casing.
import { classifyPost, isJobAdType, MIN_SAMPLE_SIZE } from "./planEngine.js";
import { calcAutoDelta, sumPaidMediaAds } from "../utils.js";

// For engagement rates computed here as impressions/engagements fractions
// (organicRate, paidRate — both normalized to 0..1 before this point).
function pct(rate) {
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : null;
}

// For engagement rates read straight from the DB, already stored as plain
// percent numbers (e.g. 4.53 meaning 4.53%) — social_platforms.engagement_rate,
// paid_media_ads.engagement_rate. No /100 round-trip, unlike pct() above.
function pctNumber(n) {
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : null;
}

const EMPTY_PLATFORM_FOCUS = { status: "empty", platform: null, engagementRate: null, weight: 0 };
const EMPTY_JOB_AD_SIGNAL  = { status: "empty", organicRate: null, paidRate: null, weight: 0 };
const EMPTY_WEB_FUNNEL     = { status: "empty", weight: 0, favorLinked: false, sessionsPct: null, formsPct: null };

// ─── Platform focus ─────────────────────────────────────────────────
// Which platform to double down on this week: the one with the best
// engagement rate this quarter, weighted up when it's also pulling away
// from the others rather than just nosing ahead. A single active
// platform isn't a "focus" — there's no choice being made — so that's
// empty too.
const PLATFORM_LEAD_MIN = 0.2;             // must be at least 20% ahead of the pack to count as a "focus" at all
const PLATFORM_LEAD_FOR_FULL_WEIGHT = 0.5; // 50% ahead of the pack's average = full weight

export function buildPlatformFocusSignal(platforms, prevPlatforms = []) {
  const active = (platforms || []).filter(p => Number.isFinite(p.engagement_rate) && p.engagement_rate > 0);
  if (active.length < 2) return EMPTY_PLATFORM_FOCUS;

  const prevByName = new Map((prevPlatforms || []).map(p => [(p.name || "").toLowerCase(), p]));
  const scored = active.map(p => {
    const prev = prevByName.get((p.name || "").toLowerCase());
    const delta = calcAutoDelta(p.engagement_rate, prev?.engagement_rate);
    const momentum = !delta ? 0 : delta.dir === "up" ? delta.pct : delta.dir === "down" ? -delta.pct : 0;
    return { name: p.name, engagementRate: p.engagement_rate, momentum };
  }).sort((a, b) => b.engagementRate - a.engagementRate || b.momentum - a.momentum);

  const [best, ...others] = scored;
  const avgOthers = others.reduce((a, p) => a + p.engagementRate, 0) / others.length;
  const lead = avgOthers > 0 ? (best.engagementRate - avgOthers) / avgOthers : (best.engagementRate > 0 ? 1 : 0);
  if (lead < PLATFORM_LEAD_MIN) return EMPTY_PLATFORM_FOCUS;
  const weight = Math.max(0, Math.min(1, (lead - PLATFORM_LEAD_MIN) / (PLATFORM_LEAD_FOR_FULL_WEIGHT - PLATFORM_LEAD_MIN)));

  return { status: "ready", platform: best.name, engagementRate: best.engagementRate, weight };
}

// ─── Job ad: paid vs organic ────────────────────────────────────────
// Compares this quarter's organic job-posting engagement (from the post
// log) against paid job-ad performance (Paid Media section). Only
// signals "boost recommended" when paid meaningfully outperforms organic
// on a real sample of both — never from a single lucky ad or a
// thin organic sample.
const JOB_SIGNAL_MIN_RATIO = 1.15; // paid must beat organic by 15%+ to register at all
const JOB_SIGNAL_RATIO_FOR_FULL_WEIGHT = 2; // paid at 2x organic = full weight

export function buildJobAdSignal(posts, paidMedia, { now } = {}) {
  void now; // reserved for future recency weighting; unused today, kept for a stable call signature
  const jobPosts = (posts || []).filter(
    p => p.post_date && Number(p.impressions) > 0 && isJobAdType(classifyPost(p).label)
  );
  if (jobPosts.length < MIN_SAMPLE_SIZE) return EMPTY_JOB_AD_SIGNAL;

  let organicImp = 0, organicEng = 0;
  for (const p of jobPosts) {
    organicImp += Number(p.impressions) || 0;
    organicEng += Number(p.engagements) || 0;
  }
  if (organicImp <= 0) return EMPTY_JOB_AD_SIGNAL;
  const organicRate = organicEng / organicImp;

  const ads = (paidMedia || []).flatMap(c => c.ads || []);
  const paidTotals = sumPaidMediaAds(ads);
  if (!paidTotals.impressions || paidTotals.engagementRate == null) return EMPTY_JOB_AD_SIGNAL;
  const paidRate = paidTotals.engagementRate / 100; // stored as a percent number, organicRate is a fraction

  // organicRate can legitimately be 0 (a job post that got zero engagement) —
  // treat any real paid engagement as an unbounded ratio rather than dividing
  // by zero, so a live paid campaign still registers against a dead organic one.
  const ratio = organicRate > 0 ? paidRate / organicRate : (paidRate > 0 ? Infinity : 0);
  if (ratio < JOB_SIGNAL_MIN_RATIO) return EMPTY_JOB_AD_SIGNAL;

  const weight = Math.max(0, Math.min(1, (ratio - JOB_SIGNAL_MIN_RATIO) / (JOB_SIGNAL_RATIO_FOR_FULL_WEIGHT - JOB_SIGNAL_MIN_RATIO)));

  return { status: "ready", organicRate, paidRate, weight };
}

// ─── Web funnel ─────────────────────────────────────────────────────
// Flags a softening funnel — site traffic holding up or growing while
// form submissions fall behind it — and, when it fires, biases content-
// type ranking toward types that actually link back to the site (posts
// with a URL logged), since those are the ones capable of moving a
// lagging conversion number.
const WEB_FUNNEL_GAP_THRESHOLD = 10;      // sessions must be outpacing forms by 10+ points to count
const WEB_FUNNEL_GAP_FOR_FULL_WEIGHT = 40; // a 40+ point gap = full weight

export function buildWebFunnelSignal(webData, prevWebData) {
  const cur = webData?.overall, prev = prevWebData?.overall;
  if (!cur || !prev) return EMPTY_WEB_FUNNEL;

  const sessionsDelta = calcAutoDelta(cur.sessions, prev.sessions);
  const formsDelta = calcAutoDelta(cur.formSubmissions, prev.formSubmissions);
  if (!sessionsDelta || !formsDelta) return EMPTY_WEB_FUNNEL;

  const sessionsPct = sessionsDelta.dir === "down" ? -sessionsDelta.pct : sessionsDelta.pct;
  const formsPct = formsDelta.dir === "down" ? -formsDelta.pct : formsDelta.pct;
  if (sessionsPct < 0) return EMPTY_WEB_FUNNEL;

  const gap = sessionsPct - formsPct;
  const weight = Math.max(0, Math.min(1, (gap - WEB_FUNNEL_GAP_THRESHOLD) / (WEB_FUNNEL_GAP_FOR_FULL_WEIGHT - WEB_FUNNEL_GAP_THRESHOLD)));
  if (weight <= 0) return EMPTY_WEB_FUNNEL;

  return { status: "ready", weight, favorLinked: true, sessionsPct, formsPct };
}

// ─── Narratives ─────────────────────────────────────────────────────
// One plain-English line per active signal, ready for the Plan tab's
// signals strip. Same spirit as buildPlanNarrative: no line at all for
// a signal that came back "empty".
export function buildSignalNarratives({ platformFocus, jobAdSignal, webFunnel } = {}) {
  const lines = [];

  if (platformFocus?.status === "ready") {
    lines.push(
      `${platformFocus.platform} is pulling ahead of your other platforms this quarter ` +
      `(${pctNumber(platformFocus.engagementRate)} engagement) — this week's picks lean toward content that's worked there.`
    );
  }

  if (jobAdSignal?.status === "ready") {
    lines.push(
      `Boosted job ads are outperforming organic ones (${pct(jobAdSignal.paidRate)} vs ${pct(jobAdSignal.organicRate)}) — ` +
      `worth pairing this week's job-ad slot with paid promotion.`
    );
  }

  if (webFunnel?.status === "ready") {
    lines.push(
      `Site traffic is up ${webFunnel.sessionsPct.toFixed(0)}% but form submissions aren't keeping pace — ` +
      `this week's picks lean toward posts that link back to the site.`
    );
  }

  return lines;
}
