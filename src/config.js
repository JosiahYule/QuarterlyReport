export const AGENCIES = {
  isl: { label: "ISL", name: "Integrated Staffing",    prefix: "isl", url: "https://integratedstaffing.ca" },
  as:  { label: "AS",  name: "Accountant Staffing",     prefix: "as",  url: "https://accountantstaffing.ca" },
  ads: { label: "ADS", name: "Administrative Staffing", prefix: "ads", url: "https://administrativestaffing.ca" },
};

export const QUARTERS = [
  { suffix: "q3", label: "Q3", rangeLabel: "Mar–May 2026", year: "2026" },
  { suffix: "q2", label: "Q2", rangeLabel: "Dec–Feb 2026", year: "2026" },
  { suffix: "q1", label: "Q1", rangeLabel: "Sep–Nov 2025", year: "2025" },
];

export const SOCIAL_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwB-RGI1lVHrUE03PkkSEYbLuiTLxE4phMBBOm81diNJtSPyUWGoB_bOlkgFIoVF4yzLQ/exec";

export const WEB_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwWpZWB_eP48AX_B4TkGgKjEJPGoB7y9ynpv74SWA3MiEtV-Kmd-0eV-ecfTIysbWY3CQ/exec";

export const VIEWS = ["social", "web", "trends"];

export const TRENDS_QUARTERS = [
  { suffix: "q1", label: "Q1", rangeLabel: "Sep–Nov 2025", start: new Date("2025-09-01"), end: new Date("2025-12-01") },
  { suffix: "q2", label: "Q2", rangeLabel: "Dec–Feb 2026", start: new Date("2025-12-01"), end: new Date("2026-03-01") },
  { suffix: "q3", label: "Q3", rangeLabel: "Mar–May 2026", start: new Date("2026-03-01"), end: new Date("2026-06-01"), isCurrent: true },
];
