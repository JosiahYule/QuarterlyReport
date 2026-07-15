// Parsing + normalizing the website contact form's CSV export.
// Each export is a full dump, so rows are normalized to a stable shape and
// deduped in the database on (agency, submitted_at, email).

// RFC 4180 parser — quoted fields may contain commas, escaped quotes ("")
// and raw newlines (the comment fields regularly span several lines), so a
// split-on-newline parser can't handle this export.
export function parseCsvRecords(text) {
  const records = [];
  let field = "", record = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field); field = "";
      records.push(record); record = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length) { record.push(field); records.push(record); }
  return records.filter(r => r.some(f => f.trim() !== ""));
}

const INTENTS = { "looking for work": "work", "looking for staff": "staff" };

// The export's first column is the submission timestamp, but its header is
// the export timezone ("America/Halifax") rather than anything like "Date".
const isTimezoneHeader = h => /^\S+\/\S+$/.test(h);

export function normalizeSubmissions(text, agency) {
  const records = parseCsvRecords(text);
  if (records.length < 2) return { rows: [], skipped: 0 };

  const headers = records[0].map(h => h.trim().toLowerCase());
  const find = (pred) => headers.findIndex(pred);
  const iTime   = find(isTimezoneHeader) !== -1 ? find(isTimezoneHeader) : 0;
  const iName   = find(h => h === "name");
  const iEmail  = find(h => h === "email");
  const iPhone  = find(h => h === "phone");
  const iLoc    = find(h => h === "location");
  const iSource = find(h => h.includes("how did you hear"));
  const iDetail = find(h => h.includes("please describe"));
  const iComm   = find(h => h.includes("comments"));
  const iDoc    = find(h => h.includes("document"));
  const iMktg   = find(h => h.includes("accepts marketing"));
  // One column per branch carries the visitor's intent ("Looking for Work" /
  // "Looking for Staff"). Exactly one is filled per row; which column it is
  // matters less than the value, so scan them all. ("Radio" is the form's
  // misnamed St. John's services column.)
  const intentCols = headers
    .map((h, i) => (h.endsWith("services") || h === "radio" ? i : -1))
    .filter(i => i !== -1);

  const get = (rec, i) => (i !== -1 && rec[i] != null ? rec[i].trim() : "");
  const rows = [];
  let skipped = 0;

  for (const rec of records.slice(1)) {
    const ts = get(rec, iTime);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) { skipped++; continue; }
    let intent = "unknown";
    for (const i of intentCols) {
      const v = INTENTS[get(rec, i).toLowerCase()];
      if (v) { intent = v; break; }
    }
    rows.push({
      agency,
      submitted_at:      ts,
      name:              get(rec, iName),
      email:             get(rec, iEmail).toLowerCase(),
      phone:             get(rec, iPhone),
      location:          get(rec, iLoc),
      intent,
      source:            get(rec, iSource),
      source_detail:     get(rec, iDetail),
      comments:          get(rec, iComm),
      document_url:      get(rec, iDoc),
      accepts_marketing: get(rec, iMktg).toLowerCase() === "true",
    });
  }
  return { rows, skipped };
}
