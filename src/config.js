export const AGENCIES = {
  isl: { label: "ISL", name: "Integrated Staffing", prefix: "isl", url: "https://integratedstaffing.ca" },
  as: { label: "AS", name: "Accountant Staffing", prefix: "as", url: "https://accountantstaffing.ca" },
  ads: {
    label: "ADS",
    name: "Administrative Staffing",
    prefix: "ads",
    url: "https://administrativestaffing.ca",
  },
};

export const VIEWS = ["social", "web", "paid", "trends"];

// Display names for the views. The nav tabs, the document title and the
// screen-reader announcement all read from here, so the four views are named
// in exactly one place.
export const VIEW_LABELS = {
  social: "Social Media",
  web: "Website",
  paid: "Paid Media",
  trends: "Trends",
};

export const REPORT_AUTHOR = "Josiah Yule";

// All "what quarter is it right now" decisions use the agencies' home
// timezone, so every viewer sees the same default quarter regardless of
// where (or with what system clock) they open the report.
export const REPORT_TZ = "America/Halifax";

function nowInReportTZ() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: REPORT_TZ,
      year: "numeric",
      month: "numeric",
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const y = get("year"),
      m = get("month");
    if (Number.isFinite(y) && Number.isFinite(m)) return { y, m: m - 1 };
  } catch {
    // Intl timezone data unavailable — fall through to local time
  }
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}

// ─── Quarter calendar (fiscal year starts September) ──────────────
// startM / endM are 0-indexed months; endM is the exclusive boundary
// (first month of the following quarter, same convention as Date math).
const Q_DEFS = [
  { suffix: "q1", label: "Q1", startM: 8, endM: 11 },
  { suffix: "q2", label: "Q2", startM: 11, endM: 2 },
  { suffix: "q3", label: "Q3", startM: 2, endM: 5 },
  { suffix: "q4", label: "Q4", startM: 5, endM: 8 },
];
const FISCAL_START_MONTH = 8; // September
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A quarter has two names, for two audiences.
//
//   suffix + year  The database key: "q2" + "2027". The year is the calendar
//                  year of the quarter's last day, which every table and the
//                  snapshot cron already use, so it stays.
//   id / title     What readers see and share: "q2-2026-27" / "Q2 2026–27",
//                  named by the fiscal year. Labelling by the database year
//                  read out of order, because Q1 ends in the calendar year its
//                  fiscal year starts and the other three end in the next:
//                  "Q1 2026" was newer than "Q4 2026".
//
// Quarters are built once and cached, so the same quarter is always the same
// object and can be compared with ===.
const built = new Map();

function buildQuarter(def, startYear) {
  const key = `${def.suffix}:${startYear}`;
  if (built.has(key)) return built.get(key);

  const endYear = def.endM <= def.startM ? startYear + 1 : startYear;
  const start = new Date(startYear, def.startM, 1);
  const end = new Date(endYear, def.endM, 1);
  const last = new Date(endYear, def.endM, 0); // day 0 = last day of the month before
  const fiscalStart = def.startM >= FISCAL_START_MONTH ? startYear : startYear - 1;
  const fiscalYear = `${fiscalStart}–${String(fiscalStart + 1).slice(-2)}`;
  const from = MONTHS[def.startM];
  const to = MONTHS[last.getMonth()];

  const q = Object.freeze({
    id: `${def.suffix}-${fiscalStart}-${String(fiscalStart + 1).slice(-2)}`,
    suffix: def.suffix,
    year: String(last.getFullYear()),
    label: def.label,
    fiscalYear,
    title: `${def.label} ${fiscalYear}`,
    months: `${from}–${to}`,
    // "Dec 2026–Feb 2027" rather than "Dec–Feb 2027", which read as if the
    // quarter started in the December of the year it ends in.
    rangeLabel:
      startYear === last.getFullYear()
        ? `${from}–${to} ${startYear}`
        : `${from} ${startYear}–${to} ${last.getFullYear()}`,
    start,
    end,
  });
  built.set(key, q);
  return q;
}

export function quarterForMonthYear(m, y) {
  for (const def of Q_DEFS) {
    if (def.startM < def.endM) {
      if (m >= def.startM && m < def.endM) return buildQuarter(def, y);
    } else {
      // Quarter wraps the calendar year boundary (Q2: Dec–Feb)
      if (m >= def.startM) return buildQuarter(def, y);
      if (m < def.endM) return buildQuarter(def, y - 1);
    }
  }
}

// The quarter before, found by date, so it exists for any quarter rather than
// only for those with a neighbour in a menu.
export function previousQuarter(q) {
  const monthBefore = new Date(q.start.getFullYear(), q.start.getMonth() - 1, 1);
  return quarterForMonthYear(monthBefore.getMonth(), monthBefore.getFullYear());
}

// Auto-detected from today's date (in REPORT_TZ), so nothing changes by hand
// when a quarter rolls over.
const today = nowInReportTZ();
export const CURRENT_QUARTER = quarterForMonthYear(today.m, today.y);

// The first quarter the report covers. The quarter menus run from here to the
// current quarter, so a report never ages out of reach.
export const FIRST_QUARTER = quarterForMonthYear(8, 2025);

// Every quarter a reader can open, most recent first.
export const QUARTERS = (() => {
  const list = [CURRENT_QUARTER];
  while (list.at(-1).start > FIRST_QUARTER.start) list.push(previousQuarter(list.at(-1)));
  return list;
})();

// Trends analysis, oldest first: [0] two ago, [1] previous, [2] current.
export const TRENDS_QUARTERS = [
  previousQuarter(previousQuarter(CURRENT_QUARTER)),
  previousQuarter(CURRENT_QUARTER),
  CURRENT_QUARTER,
];

// The quarter a database row describes, from its (quarter, year) key.
export function quarterFromKey(suffix, year) {
  const def = Q_DEFS.find((d) => d.suffix === suffix);
  const y = Number(year);
  if (!def || !Number.isInteger(y)) return null;
  return buildQuarter(def, def.endM <= def.startM ? y - 1 : y);
}

// The quarter a URL names, or null if it names none a reader can open.
//
// Takes the full id ("q2-2026-27") and also the bare suffix links carried
// before quarters named their fiscal year ("q2"). A bare suffix resolves within
// the last four quarters, the window those links were written against.
export function quarterFromId(id) {
  if (typeof id !== "string") return null;
  const legacy = QUARTERS.slice(0, 4).find((q) => q.suffix === id);
  if (legacy) return legacy;

  const m = /^(q[1-4])-(\d{4})-(\d{2})$/.exec(id);
  if (!m || (Number(m[2]) + 1) % 100 !== Number(m[3])) return null;
  const def = Q_DEFS.find((d) => d.suffix === m[1]);
  const fiscalStart = Number(m[2]);
  const q = buildQuarter(def, def.startM >= FISCAL_START_MONTH ? fiscalStart : fiscalStart + 1);
  return QUARTERS.includes(q) ? q : null;
}

// quarterFromId, falling back to the current quarter, for code that must
// render something.
export function resolveQuarter(id) {
  return quarterFromId(id) ?? CURRENT_QUARTER;
}
