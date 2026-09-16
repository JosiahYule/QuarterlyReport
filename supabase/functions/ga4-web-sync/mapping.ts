// Pure translation between the GA4 Data API and the portal's web_* tables.
//
// Kept apart from index.ts so it can be tested without credentials, a network,
// or Deno. This is the half most likely to be quietly wrong -- fiscal quarter
// boundaries, ratios that need a x100, GA4's names for things -- so it is the
// half that has tests.

export const REPORT_TZ = "America/Halifax";
export const MAX_PAGES = 10;

// GA4 names this channel "Organic Social"; the report has always called it
// "Social". WebPage.jsx matches this quarter's channels to last quarter's by
// lowercased name, so renaming it here is what keeps the delta arrows working.
export const CHANNEL_ALIASES: Record<string, string> = {
  "Organic Social": "Social",
};

export type BrandConfig = { env: string; pageLabels: Record<string, string> };

// Property IDs come from the environment so adding ADS later is a secret to
// set, not a deploy. A brand with no property ID configured is skipped.
//
// pageLabels maps a GA4 pagePath onto the label the report shows. A non-empty
// map acts as a WHITELIST: only those pages are written. That is deliberate.
// Top Pages has always meant the site's main sections, and GA4's raw top-N
// would be swamped by individual job postings the moment one went viral.
//
// An EMPTY map takes GA4's top pages as they come and derives a label from the
// slug -- the right starting point for a brand with no history to preserve.
export const BRANDS: Record<string, BrandConfig> = {
  isl: {
    env: "GA4_PROPERTY_ISL",
    // Best reading of integratedstaffing.ca's Squarespace slugs, chosen to
    // reproduce the labels already in web_pages. VERIFY against a dry run
    // before trusting a scheduled write: a wrong path here simply will not
    // match, and the run reports how many did.
    pageLabels: {
      "/": "Home Page",
      "/find-work": "Find Work",
      "/contact": "Contact",
      "/team": "Team",
      "/hire": "Hire",
      "/contract": "Contract",
      "/about": "About",
      "/direct-hire": "Direct Hire",
      "/learn": "Learn",
    },
  },
  ads: {
    env: "GA4_PROPERTY_ADS",
    pageLabels: {},
  },
  as: {
    env: "GA4_PROPERTY_AS",
    // No web history for this brand, so nothing to stay consistent with.
    // Labels derive from the slug until a dry run shows what is actually there.
    pageLabels: {},
  },
};

// ─── Fiscal calendar ──────────────────────────────────────────────
// Mirrors Q_DEFS/buildQuarter in src/config.js and public.fiscal_quarter():
// the fiscal year starts in September, and a quarter is labelled with the
// calendar year of its last day. Dates are UTC-midnight throughout so the
// arithmetic is plain calendar arithmetic with no DST edges in it.
export const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

export function todayInReportTZ(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return utc(get("year"), get("month") - 1, get("day"));
}

export type Quarter = { suffix: string; year: string; start: Date };

export function fiscalQuarter(d: Date): Quarter {
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  if (m >= 8 && m <= 10) return { suffix: "q1", year: String(y), start: utc(y, 8, 1) };
  // December opens Q2 but belongs to the NEXT calendar year's label, because
  // the quarter's last day (end of February) falls in that year.
  if (m === 11) return { suffix: "q2", year: String(y + 1), start: utc(y, 11, 1) };
  if (m <= 1) return { suffix: "q2", year: String(y), start: utc(y - 1, 11, 1) };
  if (m <= 4) return { suffix: "q3", year: String(y), start: utc(y, 2, 1) };
  return { suffix: "q4", year: String(y), start: utc(y, 5, 1) };
}

// The quarter that ended the day before this one began.
export function previousQuarter(q: Quarter): Quarter {
  return fiscalQuarter(new Date(q.start.getTime() - 86400000));
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// How long after a quarter rolls over the job keeps closing out the one that
// just ended.
//
// Without this every quarter is permanently short. The job only ever writes
// the CURRENT quarter, so a quarter that ends on 31 August is last written by
// whichever weekly run happened before it -- as much as six days early -- and
// from 1 September the job has moved on to Q1 and never returns. Every
// quarter in the archive would be missing its final week.
//
// Two weeks covers two weekly runs, so one failed run does not lose the
// close-out. Re-running inside the window is harmless: the range is fixed
// (quarter start to quarter end) so it writes the same figures every time.
export const CLOSEOUT_DAYS = 14;

// The quarters a run should write, each with the last day to report on.
// Normally one: the current quarter, up to yesterday. Just after a rollover,
// also the quarter that just closed, up to its real final day.
export function quartersToSync(today: Date): { quarter: Quarter; endDate: Date }[] {
  const yesterday = new Date(today.getTime() - 86400000);
  const current = fiscalQuarter(today);
  const targets: { quarter: Quarter; endDate: Date }[] = [];

  const daysIn = Math.round((today.getTime() - current.start.getTime()) / 86400000);
  if (daysIn < CLOSEOUT_DAYS) {
    const prev = previousQuarter(current);
    targets.push({ quarter: prev, endDate: new Date(current.start.getTime() - 86400000) });
  }

  // In the first day or two of a quarter there is no closed day inside it yet,
  // so there is nothing to report and the range would be inverted.
  if (yesterday >= current.start) targets.push({ quarter: current, endDate: yesterday });

  return targets;
}

// Explicit historical runs do not depend on the 14-day automatic close-out.
export function requestedQuarter(today: Date, suffix: unknown, year: unknown): { quarter: Quarter; endDate: Date } {
  if (typeof suffix !== "string" || !/^q[1-4]$/.test(suffix) ||
      (typeof year !== "string" && typeof year !== "number") ||
      !/^[0-9]{4}$/.test(String(year)) || Number(year) < 2000 || Number(year) > 9999) {
    throw new Error("Provide quarter (q1, q2, q3, q4) and its four-digit ending year together");
  }
  const y = Number(year);
  const starts: Record<string, Date> = {
    q1: utc(y, 8, 1), q2: utc(y - 1, 11, 1), q3: utc(y, 2, 1), q4: utc(y, 5, 1),
  };
  const start = starts[suffix];
  const last = utc(start.getUTCFullYear(), start.getUTCMonth() + 3, 0);
  const yesterday = new Date(today.getTime() - 86400000);
  if (start > yesterday) throw new Error("Requested quarter has no complete day yet");
  return { quarter: { suffix, year: String(year), start }, endDate: last < yesterday ? last : yesterday };
}

// ─── GA4 response shapes ──────────────────────────────────────────
export type Ga4Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
export type Ga4Report = { rows?: Ga4Row[] };

// GA4 returns every metric as a string and omits the entry entirely when a row
// has no value for it, so every read goes through here.
export const metric = (row: Ga4Row | undefined, i: number): number => {
  const n = Number(row?.metricValues?.[i]?.value);
  return Number.isFinite(n) ? n : 0;
};

// ─── KPI mapping ──────────────────────────────────────────────────
// GA4 API names differ from the UI labels, so each choice is stated:
//
//   sessions                 -> sessions
//   users                    -> totalUsers. The UI's "Total users". activeUsers
//                               is what some UI reports label "Users" and is a
//                               smaller number; the portal's label is "Unique
//                               Users" and its history (ISL Q4: 27,880 sessions
//                               to 19,809 users) fits totalUsers.
//   engagement_rate          -> engagementRate, a ratio 0-1, stored as a
//                               percentage, hence the x100.
//   avg_engagement_time_sec  -> userEngagementDuration / sessions, which is how
//                               the UI computes "Average engagement time per
//                               session". No single API metric returns it.
//                               averageSessionDuration is a different number:
//                               it counts time the visitor was not engaged, and
//                               this field's note reads "active engagement per
//                               visit".
//
// Returns null when GA4 has no sessions for the range. The caller treats that
// as "do not write", never as zero.
export const KPI_METRICS = ["sessions", "totalUsers", "engagementRate", "userEngagementDuration"];

export function buildKpis(report: Ga4Report) {
  const row = report.rows?.[0];
  if (!row) return null;
  const sessions = metric(row, 0);
  if (sessions <= 0) return null;
  return {
    sessions: Math.round(sessions),
    users: Math.round(metric(row, 1)),
    engagement_rate: Number((metric(row, 2) * 100).toFixed(3)),
    avg_engagement_time_sec: Math.round(metric(row, 3) / sessions),
  };
}

// ─── Channel mapping ──────────────────────────────────────────────
//   name             -> sessionDefaultChannelGroup, the UI's "Session default
//                       channel group", whose values are Organic Search /
//                       Direct / Referral / Organic Social / ...
//   sessions         -> sessions
//   engagement_rate  -> engagementRate (x100)
//   share_of_traffic -> computed; GA4 has no share metric. The denominator is
//                       the sum of the channel rows rather than the KPI session
//                       total, so the column sums to 100.0 instead of the
//                       100.06 a hand-built table lands on.
export const CHANNEL_DIMENSION = "sessionDefaultChannelGroup";
export const CHANNEL_METRICS = ["sessions", "engagementRate"];

export function buildChannels(report: Ga4Report) {
  const kept = (report.rows ?? [])
    .map((r) => {
      const raw = r.dimensionValues?.[0]?.value ?? "";
      return {
        name: CHANNEL_ALIASES[raw] ?? raw,
        sessions: Math.round(metric(r, 0)),
        engagement_rate: Number((metric(r, 1) * 100).toFixed(3)),
      };
    })
    .filter((r) => r.name && r.sessions > 0);

  const total = kept.reduce((sum, r) => sum + r.sessions, 0);
  if (!kept.length || total <= 0) return null;
  return kept.map((r) => ({
    ...r,
    share_of_traffic: Number(((r.sessions / total) * 100).toFixed(3)),
  }));
}

// ─── Page mapping ─────────────────────────────────────────────────
//   key                  -> the configured label for pagePath (see BRANDS)
//   page_views           -> screenPageViews, the UI's "Views"
//   bounce_rate          -> bounceRate (x100). GA4 defines it as
//                           1 - engagementRate.
//   avg_time_on_page_sec -> userEngagementDuration / activeUsers, which is how
//                           the UI computes "Average engagement time" on the
//                           Pages and screens report.
export const PAGE_DIMENSION = "pagePath";
export const PAGE_METRICS = ["screenPageViews", "bounceRate", "userEngagementDuration", "activeUsers"];

// Query strings, fragments, casing and trailing slashes make one page look
// like several.
export function normalizePath(path: string): string {
  const clean = (path || "").split("?")[0].split("#")[0].toLowerCase();
  if (clean === "" || clean === "/") return "/";
  return clean.replace(/\/+$/, "") || "/";
}

export function labelFromPath(path: string): string {
  if (path === "/") return "Home Page";
  const slug = path.replace(/^\/+/, "").split("/").pop() ?? "";
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || path;
}

// Several GA4 paths can normalize onto one label, so rows are merged. Views and
// duration add; the rates are re-derived from the merged totals rather than
// averaged, which would weight a 5-view page the same as a 5,000-view one.
export function buildPages(report: Ga4Report, labels: Record<string, string>) {
  const whitelist = Object.keys(labels).length > 0;
  const acc = new Map<
    string,
    { views: number; bounceWeighted: number; duration: number; users: number }
  >();

  for (const r of report.rows ?? []) {
    const path = normalizePath(r.dimensionValues?.[0]?.value ?? "");
    const label = labels[path] ?? (whitelist ? null : labelFromPath(path));
    if (!label) continue;
    const views = metric(r, 0);
    if (views <= 0) continue;
    const cur = acc.get(label) ?? { views: 0, bounceWeighted: 0, duration: 0, users: 0 };
    cur.views += views;
    cur.bounceWeighted += metric(r, 1) * views;
    cur.duration += metric(r, 2);
    cur.users += metric(r, 3);
    acc.set(label, cur);
  }

  return [...acc.entries()]
    .map(([key, v]) => ({
      key,
      page_views: Math.round(v.views),
      bounce_rate: Number(((v.bounceWeighted / v.views) * 100).toFixed(3)),
      avg_time_on_page_sec: v.users > 0 ? Math.round(v.duration / v.users) : null,
    }))
    .sort((a, b) => b.page_views - a.page_views)
    .slice(0, MAX_PAGES);
}

// ─── Payload ──────────────────────────────────────────────────────
// The keys deliberately absent are the whole point of the design:
//
//   summary_bullet          hand-written
//   insights (all four)     hand-written
//   actions                 "campaign clicks" has no GA4 equivalent
//   form_submissions        Squarespace exposes no analytics API; these are
//                           imported from the contact form's CSV export
//
// save_web_report() merges on key presence, so a key that is not here is not
// touched. Adding one of these later means adding it here and nowhere else.
export function buildPayload(
  agency: string,
  quarter: Quarter,
  kpis: NonNullable<ReturnType<typeof buildKpis>>,
  channels: NonNullable<ReturnType<typeof buildChannels>>,
  pages: ReturnType<typeof buildPages> | null
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    agency,
    quarter: quarter.suffix,
    year: quarter.year,
    kpis,
    channels,
  };
  if (pages?.length) payload.pages = pages;
  return payload;
}
