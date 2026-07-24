// Parser for LinkedIn Campaign Manager "Demographics" report exports.
//
// Campaign Manager exports one CSV per demographic dimension (Analyze →
// Demographics → Export). The files arrive with a few report-metadata lines
// above the real header row, quoted fields that contain commas ("Halifax,
// Nova Scotia Area"), thousands separators in counts, and sometimes a
// trailing "Total" row — all of which this module absorbs so the admin form
// can accept the file exactly as LinkedIn produced it.
import { parseCsvRecords } from "./formSubmissions.js";

// Canonical dimensions, in the order the report presents them.
export const AUDIENCE_DIMENSIONS = [
  { key: "job_function", label: "Job Function" },
  { key: "seniority",    label: "Seniority" },
  { key: "industry",     label: "Industry" },
  { key: "company_size", label: "Company Size" },
  { key: "location",     label: "Location" },
  { key: "company",      label: "Company" },
  { key: "job_title",    label: "Job Title" },
];

export const AUDIENCE_DIMENSION_LABELS = Object.fromEntries(
  AUDIENCE_DIMENSIONS.map(d => [d.key, d.label])
);

// Header-name → dimension key. Ordered so the more specific names win
// ("company size" before "company").
const DIMENSION_MATCHERS = [
  { key: "job_function", re: /job function|member function/ },
  { key: "seniority",    re: /seniority/ },
  { key: "industry",     re: /industry/ },
  { key: "company_size", re: /company size/ },
  { key: "job_title",    re: /job title/ },
  { key: "location",     re: /location|region|geo/ },
  { key: "company",      re: /company/ },
];

// "1,234" → 1234. Returns null for blanks and anything non-numeric (a stray
// "-" placeholder, or a rate column routed here by a malformed row).
function parseCount(value) {
  const s = String(value ?? "").replace(/,/g, "").trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

function detectDimension(header) {
  const h = header.toLowerCase();
  for (const m of DIMENSION_MATCHERS) {
    if (m.re.test(h)) return m.key;
  }
  return null;
}

// Parses a LinkedIn demographics export. Returns
//   { dimension, rows: [{ segment, impressions, clicks }] }
// or null when no demographics header row can be found (wrong file).
export function parseLinkedInDemographics(text) {
  const records = parseCsvRecords(String(text ?? ""));

  // Hunt for the real header row: metadata preamble lines precede it, so scan
  // until a record pairs a known dimension column with an impressions column.
  for (let i = 0; i < records.length; i++) {
    const headers = records[i].map(h => h.trim());
    const iImpressions = headers.findIndex(h => /impression/i.test(h));
    if (iImpressions === -1) continue;

    let iSegment = -1, dimension = null;
    for (let c = 0; c < headers.length; c++) {
      if (c === iImpressions) continue;
      const d = detectDimension(headers[c]);
      if (d) { iSegment = c; dimension = d; break; }
    }
    if (!dimension) continue;

    // "Clicks" only — not "Click Through Rate" / "Cost Per Click".
    const iClicks = headers.findIndex(h => /^clicks?$/i.test(h));

    const rows = [];
    for (let r = i + 1; r < records.length; r++) {
      const cols = records[r];
      const segment = (cols[iSegment] ?? "").trim();
      if (!segment || /^total$/i.test(segment)) continue;
      const impressions = parseCount(cols[iImpressions]);
      if (impressions == null) continue;
      rows.push({
        segment,
        impressions,
        clicks: iClicks !== -1 ? parseCount(cols[iClicks]) : null,
      });
    }
    return rows.length ? { dimension, rows } : null;
  }
  return null;
}
