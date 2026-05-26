export const AGENCIES = {
  isl: { label: "ISL", name: "Integrated Staffing",    prefix: "isl", url: "https://integratedstaffing.ca" },
  as:  { label: "AS",  name: "Accountant Staffing",     prefix: "as",  url: "https://accountantstaffing.ca" },
  ads: { label: "ADS", name: "Administrative Staffing", prefix: "ads", url: "https://administrativestaffing.ca" },
};

export const SOCIAL_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwB-RGI1lVHrUE03PkkSEYbLuiTLxE4phMBBOm81diNJtSPyUWGoB_bOlkgFIoVF4yzLQ/exec";

export const WEB_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwWpZWB_eP48AX_B4TkGgKjEJPGoB7y9ynpv74SWA3MiEtV-Kmd-0eV-ecfTIysbWY3CQ/exec";

export const VIEWS = ["social", "web", "trends"];

// ─── Quarter calendar (fiscal year starts September) ──────────────
// startM / endM are 0-indexed months; endM is the exclusive boundary
// (first month of the following quarter, same convention as Date math).
const Q_DEFS = [
  { suffix: "q1", label: "Q1", startM: 8,  endM: 11, range: "Sep–Nov" },
  { suffix: "q2", label: "Q2", startM: 11, endM: 2,  range: "Dec–Feb" },
  { suffix: "q3", label: "Q3", startM: 2,  endM: 5,  range: "Mar–May" },
  { suffix: "q4", label: "Q4", startM: 5,  endM: 8,  range: "Jun–Aug" },
];

function buildQuarter(def, startYear) {
  const endYear = def.endM <= def.startM ? startYear + 1 : startYear;
  const start   = new Date(startYear, def.startM, 1);
  const end     = new Date(endYear,   def.endM,   1);
  // year label = calendar year of the last day of the quarter
  const year    = String(new Date(end.getTime() - 86400000).getFullYear());
  return { suffix: def.suffix, label: def.label, rangeLabel: `${def.range} ${year}`, year, start, end };
}

function quarterForDate(date) {
  const m = date.getMonth(), y = date.getFullYear();
  for (const def of Q_DEFS) {
    if (def.startM < def.endM) {
      if (m >= def.startM && m < def.endM) return buildQuarter(def, y);
    } else {
      // Quarter wraps the calendar year boundary (Q2: Dec–Feb)
      if (m >= def.startM) return buildQuarter(def, y);
      if (m < def.endM)    return buildQuarter(def, y - 1);
    }
  }
}

function recentQuarters(n) {
  const list = [];
  let q = quarterForDate(new Date());
  for (let i = 0; i < n; i++) {
    list.push(q);
    q = quarterForDate(new Date(q.start.getTime() - 86400000));
  }
  return list;
}

// Auto-detected from today's date — no manual update needed on rollover
export const CURRENT_QUARTER = quarterForDate(new Date());

// Navigation list — most-recent-first, for the quarter chooser dropdown
export const QUARTERS = recentQuarters(4);

// Trends analysis — oldest-first ([0]=two-ago, [1]=previous, [2]=current)
export const TRENDS_QUARTERS = recentQuarters(3).reverse();
