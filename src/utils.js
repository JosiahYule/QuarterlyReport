export const FLAT = { dir: "flat", pct: 0 };

export function parseDelta(d) {
  if (d == null) return { dir: "flat", pct: 0 };
  if (typeof d === "object" && "dir" in d) return d;
  if (typeof d === "object" && "direction" in d) {
    return { dir: d.direction === "up" ? "up" : d.direction === "down" ? "down" : "flat", pct: d.percent || 0 };
  }
  if (typeof d !== "string") return { dir: "flat", pct: 0 };
  const s = d.trim();
  let dir = "flat";
  if (/^[▲↑]/.test(s) || /\bup\b/i.test(s)) dir = "up";
  else if (/^[▼↓]/.test(s) || /\bdown\b/i.test(s)) dir = "down";
  const m = s.match(/-?\d+(\.\d+)?/);
  return { dir, pct: m ? Math.abs(parseFloat(m[0])) : 0 };
}

export function arrow(dir) {
  return dir === "up" ? "↑" : dir === "down" ? "↓" : "—";
}

export function calcAutoDelta(cur, prev) {
  if (typeof cur !== "number" || typeof prev !== "number" || prev === 0) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat", pct: Math.abs(pct) };
}

export const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  if (typeof n !== "number") return String(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000)    return Math.round(n / 1000) + "K";
  if (n >= 1_000)     return (n / 1000).toFixed(1) + "K";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
};

export const fmtExact = (n) =>
  n === null || n === undefined ? "—" : typeof n === "number" ? n.toLocaleString() : "—";

export const fmtInt = (n) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";

export const fmtPct = (n) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) + "%" : "—";

export function fmtTime(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

export function fmtApprox(n, isPercent) {
  if (n === null || !Number.isFinite(n)) return "—";
  if (isPercent) return `${n.toFixed(2)}%`;
  return Math.round(n).toLocaleString();
}

export function toNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, "").replace(/\s+/g, "").replace(/%/g, "").replace(/[▲▼]/g, "").replace(/^\+/, "");
  if (!s || s === "—" || s === "-") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function nfk(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
