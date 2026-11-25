// ─── Paid campaign markers for the Trends page ─────────────────────
// Organic totals rise and fall with paid flights (ISL's July 2026 LinkedIn
// campaign ran during the three weeks that produced almost half of that
// quarter's impressions), so the Trends charts mark when paid activity ran.
// Pure helpers, no Supabase, so the date handling is unit-testable.

// "2026-07-02" → local midnight on that day. Parsed by hand: `new Date(str)`
// reads a bare ISO date as UTC midnight, which lands on the previous evening
// in Halifax and would shift every marker a day early.
function parseLocalDate(s) {
  const m = typeof s === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumberOrNull(v) {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Database rows → { name, platform, budget, start, end } with `end` exclusive
// (the day after the stored end date, which is inclusive). A campaign with no
// usable start date is `undated`: it is known to have run in the quarter but
// cannot be placed on a timeline. A start without an end is treated as a
// single day rather than guessed at.
export function normalizeCampaigns(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const start = parseLocalDate(r.start_date);
      const endIncl = parseLocalDate(r.end_date);
      let end = null;
      if (start) {
        const last = endIncl && endIncl >= start ? endIncl : start;
        end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      }
      return {
        name: (r.name || "").trim() || "Untitled campaign",
        platform: (r.platform || "").trim() || null,
        budget: toNumberOrNull(r.budget),
        start,
        end,
        undated: !start,
      };
    });
}

// The dated campaigns that overlap [from, to), clipped to that window, for
// shading a time axis. Undated campaigns are left out; callers list them in
// a note instead of inventing dates for them.
export function campaignSpans(campaigns, from, to) {
  const lo = from instanceof Date ? from.getTime() : from;
  const hi = to instanceof Date ? to.getTime() : to;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  return (campaigns || [])
    .filter((c) => !c.undated && c.start.getTime() < hi && c.end.getTime() > lo)
    .map((c) => ({
      ...c,
      from: Math.max(lo, c.start.getTime()),
      to: Math.min(hi, c.end.getTime()),
    }));
}

// "Jul 2 – Jul 23" (inclusive, as entered), or null for an undated campaign.
export function campaignDateRange(c) {
  if (!c || c.undated) return null;
  const opts = { month: "short", day: "numeric" };
  const last = new Date(c.end.getFullYear(), c.end.getMonth(), c.end.getDate() - 1);
  const a = c.start.toLocaleDateString("en-CA", opts);
  const b = last.toLocaleDateString("en-CA", opts);
  return a === b ? a : `${a} – ${b}`;
}
