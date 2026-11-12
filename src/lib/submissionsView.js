// Display and export helpers for the admin Submissions tab. Pure functions,
// so the tab's date maths and CSV output can be tested without a browser.
//
// Timestamps are Halifax wall-clock strings ("2026-11-12 15:40:00"), exactly
// as the form exports them. Every comparison here works on those strings'
// calendar parts, never on a timezone-aware Date, so a viewer in another
// timezone still sees "Today" for a submission that arrived today in Halifax.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(ts || ""));
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m.map(Number);
  return { y, mo, d, hh, mm };
}

// Whole calendar days from one Y-M-D to another. Date.UTC counts days without
// daylight-saving jumps, which is all we need it for.
const dayNumber = ({ y, mo, d }) => Date.UTC(y, mo - 1, d) / 86400000;

/** Today's date in Halifax as "YYYY-MM-DD", whatever the viewer's timezone. */
export function halifaxToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Halifax",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Days between a submission and today (0 = today). Null if unparseable. */
export function daysAgo(ts, today) {
  const a = parts(ts);
  const b = parts(today + " 00:00");
  if (!a || !b) return null;
  return dayNumber(b) - dayNumber(a);
}

function clock({ hh, mm }) {
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a.m." : "p.m."}`;
}

/** Short, scannable date for the list: "Today, 3:40 p.m.", "Yesterday", "Mon", "Nov 3", "Nov 3, 2025". */
export function shortWhen(ts, today) {
  const p = parts(ts);
  if (!p) return ts || "";
  const ago = daysAgo(ts, today);
  if (ago === 0) return `Today, ${clock(p)}`;
  if (ago === 1) return "Yesterday";
  if (ago > 1 && ago < 7) return WEEKDAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  const md = `${MONTHS[p.mo - 1]} ${p.d}`;
  return p.y === Number(today.slice(0, 4)) ? md : `${md}, ${p.y}`;
}

/** Full date and time: "Nov 12, 2026, 3:40 p.m." */
export function fullWhen(ts) {
  const p = parts(ts);
  if (!p) return ts || "";
  return `${MONTHS[p.mo - 1]} ${p.d}, ${p.y}, ${clock(p)}`;
}

/** "Moncton, NB" → "Moncton". The province is noise in a list of five branches. */
export const city = (location) =>
  String(location || "")
    .split(",")[0]
    .trim();

/** How many times each email address appears, so repeat submitters stand out. */
export function countByEmail(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!r.email) continue;
    counts.set(r.email, (counts.get(r.email) || 0) + 1);
  }
  return counts;
}

const TYPE_LABELS = { staff: "Employer lead", work: "Job seeker", unknown: "" };

const CSV_COLUMNS = [
  ["Received", (r) => r.submitted_at],
  ["Type", (r) => TYPE_LABELS[r.intent] ?? ""],
  ["Name", (r) => r.name],
  ["Email", (r) => r.email],
  ["Phone", (r) => r.phone],
  ["Location", (r) => r.location],
  ["Heard about us", (r) => r.source],
  ["Source detail", (r) => r.source_detail],
  ["Comments", (r) => r.comments],
  ["Resume", (r) => r.document_url],
];

// Anything typed into the public form ends up in this file. A cell that
// starts with = + - or @ is run as a formula when the file opens in Excel or
// Sheets, so someone could type a formula into the comment box and have it
// execute on our machine. A leading apostrophe makes the spreadsheet treat it
// as plain text instead.
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The given rows as a CSV string, ready to save. */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(","));
  // The byte-order mark tells Excel the file is UTF-8, so accented names
  // (Chloé, Benoît) don't open as garbled characters.
  return "﻿" + lines.join("\r\n");
}
