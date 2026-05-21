// ISL Quarterly Report — Organic Social Media
// Editorial design with Tweaks for layout & density variants

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "editorial",
  "density": "balanced",
  "accent": "isl",
  "trendMetric": "impressions",
  "topPlatform": "linkedin"
} /*EDITMODE-END*/;

// =================================================================
// Helpers
// =================================================================
const fmt = (n) => {
  if (typeof n !== "number") return n;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
};
const fmtExact = (n) => (typeof n === "number" ? n.toLocaleString() : "—");
const fmtPct = (n) => n.toFixed(2) + "%";
function arrow(dir) { return dir === "up" ? "↑" : dir === "down" ? "↓" : "—"; }

// =================================================================
// Delta parser
// =================================================================
function parseDelta(d) {
  if (d == null) return { dir: "flat", pct: 0 };
  if (typeof d === "object" && "dir" in d) return d;
  if (typeof d === "object" && "direction" in d) return { dir: d.direction === "up" ? "up" : d.direction === "down" ? "down" : "flat", pct: d.percent || 0 };
  if (typeof d !== "string") return { dir: "flat", pct: 0 };
  const s = d.trim();
  let dir = "flat";
  if (/^[▲↑]/.test(s) || /\bup\b/i.test(s)) dir = "up";
  else if (/^[▼↓]/.test(s) || /\bdown\b/i.test(s)) dir = "down";
  const m = s.match(/-?\d+(\.\d+)?/);
  return { dir, pct: m ? Math.abs(parseFloat(m[0])) : 0 };
}

// =================================================================
// normalizeReport
// =================================================================
function normalizeReport(r) {
  if (!r) return r;

  if (r.overall && r.platforms) {
    if (r.deltas) {
      const out = {};
      for (const k in r.deltas) out[k] = parseDelta(r.deltas[k]);
      r.deltas = out;
    }
    if (Array.isArray(r.platforms)) {
      r.platforms = r.platforms.map((p) => ({
        ...p,
        followersDelta:      parseDelta(p.followersDelta),
        engagementRateDelta: parseDelta(p.engagementRateDelta),
        pageReachDelta:      parseDelta(p.pageReachDelta),
        pageClicksDelta:     parseDelta(p.pageClicksDelta),
      }));
    }
    return r;
  }

  const overall = {}, deltas = {};
  const keyMap = {
    posts: "posts", impressions: "impressions", shares: "shares",
    reactions: "reactions", followers: "followers", linkClicks: "linkclicks",
    comments: "comments", avgEngagementRate: "avgengagementrate"
  };
  (r.quarterTotals || []).forEach((row) => {
    const mapped = keyMap[row.field] || row.field.toLowerCase();
    overall[mapped] = row.value;
    deltas[mapped] = parseDelta(row.delta);
  });

  const platforms = (r.platformBreakdown || []).map((p) => ({
    key: p.Platform.toLowerCase(), name: p.Platform,
    followers: p.Followers, followersDelta: parseDelta(p["Followers Δ"]),
    engagementRate: p["Engagement Rate"], engagementRateDelta: parseDelta(p["ER Δ"]),
    pageReach: p.Reach, pageReachDelta: parseDelta(p["Reach Δ"]),
    pageClicks: p.Clicks, pageClicksDelta: parseDelta(p["Clicks Δ"]),
    note: "",
  }));

  const topPostsByPlatform = { linkedin: [], facebook: [], instagram: [] };
  (r.topPosts || []).forEach((p) => {
    const key = (p.Platform || "").toLowerCase();
    if (topPostsByPlatform[key] && p.Title) {
      topPostsByPlatform[key].push({
        title: p.Title, impressions: p.Impressions || 0,
        likes: p.Likes || 0, shares: p.Shares || 0, flag: ""
      });
    }
  });

  const insightMap = {};
  (r.insights || []).forEach((i) => { insightMap[i.Section] = i.Text; });
  const notes = {
    working:    insightMap.working    ? [insightMap.working]    : ["No notes yet."],
    notWorking: insightMap.notWorking ? [insightMap.notWorking] : ["No notes yet."],
    actions:    insightMap.actions    ? [insightMap.actions]    : ["No notes yet."],
    next:       insightMap.next       ? [insightMap.next]       : ["No notes yet."],
  };

  const weekly = Array.from({ length: 13 }, (_, i) => ({ wk: i + 1, imp: 0, leads: 0, spend: 0 }));

  const params = new URLSearchParams(window.location.search);
  const agency = params.get("agency") || "isl";
  const reportKey = params.get("report") || (agency + "q3");

  const REPORT_META = {
    islq1:  { quarter: "Q1", quarterWord: "One",   year: "2026", rangeLabel: "Sep – Nov 2025", issue: "1" },
    islq2:  { quarter: "Q2", quarterWord: "Two",   year: "2026", rangeLabel: "Dec – Feb 2026", issue: "2" },
    islq3:  { quarter: "Q3", quarterWord: "Three", year: "2026", rangeLabel: "Mar – May 2026", issue: "3" },
    asq1:   { quarter: "Q1", quarterWord: "One",   year: "2026", rangeLabel: "Sep – Nov 2025", issue: "1" },
    asq2:   { quarter: "Q2", quarterWord: "Two",   year: "2026", rangeLabel: "Dec – Feb 2026", issue: "2" },
    asq3:   { quarter: "Q3", quarterWord: "Three", year: "2026", rangeLabel: "Mar – May 2026", issue: "3" },
    adsq1:  { quarter: "Q1", quarterWord: "One",   year: "2026", rangeLabel: "Sep – Nov 2025", issue: "1" },
    adsq2:  { quarter: "Q2", quarterWord: "Two",   year: "2026", rangeLabel: "Dec – Feb 2026", issue: "2" },
    adsq3:  { quarter: "Q3", quarterWord: "Three", year: "2026", rangeLabel: "Mar – May 2026", issue: "3" },
  };
  const reportMeta = REPORT_META[reportKey] || REPORT_META["islq3"];

  const AGENCY_NAMES = { isl: "Integrated Staffing", as: "Accountant Staffing", ads: "Administrative Staffing" };

  const meta = {
    quarter:      reportMeta.quarter,
    quarterWord:  reportMeta.quarterWord,
    year:         reportMeta.year,
    rangeLabel:   reportMeta.rangeLabel,
    generatedLabel: r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : "",
    author:       "Josiah Yule",
    issue:        reportMeta.issue,
    agencyName:   AGENCY_NAMES[agency] || "Integrated Staffing",
  };

  return {
    meta,
    editorsNote: insightMap.editorsNote || insightMap.working || "No editor's note yet.",
    overall, deltas, platforms, topPostsByPlatform, notes, weekly,
    allPosts: r.allPosts || []
  };
}

// =================================================================
// Hero
// =================================================================
function Hero({ data }) {
  return (
    <section className="hero wrap" data-screen-label="01 Hero">
      <div className="hero-kicker">{data.meta.quarter} Report · Social Media</div>
      <h1 className="hero-title serif" style={{ fontWeight: "100", fontFamily: '"Instrument Serif"' }}>
        Quarter <em>{data.meta.quarterWord}</em>
      </h1>
      <div className="hero-meta-row" role="list" aria-label="Report metadata">
        <div className="meta-pair" role="listitem"><span className="label">Reporting period</span><span className="value serif">{data.meta.rangeLabel}</span></div>
        <div className="meta-pair" role="listitem"><span className="label">Generated</span><span className="value serif">{data.meta.generatedLabel}</span></div>
        <div className="meta-pair" role="listitem"><span className="label">Prepared by</span><span className="value serif">{data.meta.author}</span></div>
      </div>
      <div className="hero-lede-row">
        <p className="hero-lede serif">
          {data.editorsNote.split(/(\bLinkedIn\b|\bFacebook\b|\bInstagram\b)/).map((part, i) =>
            part === "LinkedIn" || part === "Facebook" || part === "Instagram"
              ? <em key={i}>{part}</em>
              : <React.Fragment key={i}>{part}</React.Fragment>
          )}
        </p>
      </div>
    </section>
  );
}

// =================================================================
// Numbers (KPIs)
// =================================================================
const KPI_DEFS = [
  { key: "posts",             label: "Posts Published",     fmt: fmtExact,                  note: "across all platforms" },
  { key: "impressions",       label: "Impressions",         fmt: fmt,                        note: "total reach served" },
  { key: "shares",            label: "Shares",              fmt: fmtExact,                  note: "amplification by audience" },
  { key: "reactions",         label: "Reactions",           fmt: fmtExact,                  note: "likes + reactions" },
  { key: "followers",         label: "Followers",           fmt: fmtExact,                  note: "combined audience" },
  { key: "linkclicks",        label: "Link Clicks",         fmt: fmtExact,                  note: "engagement with posts" },
  { key: "comments",          label: "Comments",            fmt: fmtExact,                  note: "depth of conversation" },
  { key: "avgengagementrate", label: "Avg Engagement Rate", fmt: (v) => v.toFixed(2) + "%", note: "blended across posts" },
];

function Numbers({ data }) {
  return (
    <section className="section wrap" data-screen-label="02 Numbers">
      <header className="section-head"><h2 className="section-title serif">The Numbers</h2></header>
      <div className="kpi-grid">
        {KPI_DEFS.map((k) => {
          const v = data.overall[k.key];
          const d = data.deltas[k.key];
          return (
            <div className="kpi" key={k.key}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value num">{k.fmt(v)}</div>
              <div className="kpi-foot">
                <span className={"delta " + d.dir}><span className="arrow serif ital">{arrow(d.dir)}</span><span>{d.pct.toFixed(1)}%</span></span>
                <span className="delta-note">{k.note}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// =================================================================
// Trend Chart
// =================================================================
function TrendChart({ data, metric = "impressions" }) {
  const w = 1100, h = 320, padL = 56, padR = 20, padT = 30, padB = 40;
  const series = useMemo(() => ({
    labels: data.weekly.map((d) => d.wk),
    lines: {
      impressions: { name: "Impressions (K)", values: data.weekly.map((d) => d.imp),   color: "var(--isl-blue)", unit: "K" },
      engagements: { name: "Engagements",     values: data.weekly.map((d) => d.leads), color: "var(--ink)",     unit: "" },
      linkclicks:  { name: "Link Clicks",     values: data.weekly.map((d) => d.spend), color: "var(--ink-3)",   unit: "" },
    },
  }), [data]);

  const active = series.lines[metric] || series.lines.impressions;
  const max = Math.max(...active.values) * 1.15, min = 0;
  const xStep = (w - padL - padR) / (active.values.length - 1);
  const points = active.values.map((v, i) => [padL + i * xStep, padT + (h - padT - padB) * (1 - (v - min) / (max - min))]);
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath = path + ` L${points[points.length - 1][0]},${h - padB} L${points[0][0]},${h - padB} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: min + (max - min) * t, y: padT + (h - padT - padB) * (1 - t) }));
  const avg = active.values.reduce((a, b) => a + b, 0) / active.values.length;
  const peakIdx = active.values.indexOf(Math.max(...active.values));

  return (
    <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {ticks.map((t, i) => <g key={i}>
        <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke="var(--rule-soft)" strokeWidth="1" />
        <text x={padL - 12} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">{t.v < 10 ? t.v.toFixed(1) : Math.round(t.v)}{active.unit}</text>
      </g>)}
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="var(--ink)" strokeWidth="1" />
      <path d={areaPath} fill={active.color} opacity="0.06" />
      <path d={path} fill="none" stroke={active.color} strokeWidth="1.5" />
      {points.map((p, i) => <g key={i}>
        <circle cx={p[0]} cy={p[1]} r={i === peakIdx ? 4 : 2.5} fill="var(--paper)" stroke={active.color} strokeWidth="1.5" />
        {i === peakIdx && <text x={p[0]} y={p[1] - 14} textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="14" fill="var(--isl-blue)">peak — {active.values[i] < 10 ? active.values[i].toFixed(1) : active.values[i]}{active.unit}</text>}
      </g>)}
      {series.labels.map((l, i) => <text key={l} x={padL + i * xStep} y={h - padB + 18} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--sans)">{l}</text>)}
      <line x1={padL} x2={w - padR} y1={padT + (h - padT - padB) * (1 - (avg - min) / (max - min))} y2={padT + (h - padT - padB) * (1 - (avg - min) / (max - min))} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 4" />
      <text x={w - padR} y={padT + (h - padT - padB) * (1 - (avg - min) / (max - min)) - 6} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">avg {avg < 10 ? avg.toFixed(1) : Math.round(avg)}{active.unit}</text>
    </svg>
  );
}

function Trend({ data, metric, setMetric }) {
  if (!data.weekly || data.weekly.every(w => w.imp === 0)) return null;
  const tab = (k, label) => {
    const lines = {
      impressions: { vals: data.weekly.map((w) => w.imp),   color: "var(--isl-blue)", unit: "K" },
      engagements: { vals: data.weekly.map((w) => w.leads), color: "var(--ink)",      unit: "" },
      linkclicks:  { vals: data.weekly.map((w) => w.spend), color: "var(--ink-3)",    unit: "" },
    };
    const l = lines[k];
    const total = l.vals.reduce((a, b) => a + b, 0);
    const display = l.unit === "K" ? Math.round(total) + "K" : Math.round(total).toLocaleString();
    return (
      <span className={"legend-item" + (metric === k ? "" : " is-off")} onClick={() => setMetric(k)}>
        <span className="swatch" style={{ background: l.color }}></span>
        <span>{label}</span>
        <span className="v serif num">{display}</span>
      </span>
    );
  };
  return (
    <section className="section wrap" data-screen-label="03 Trend">
      <header className="section-head"><h2 className="section-title serif">Week by Week</h2></header>
      <div className="trend-body">
        <TrendChart data={data} metric={metric} />
        <div className="trend-legend">
          {tab("impressions", "Impressions")}
          {tab("engagements", "Engagements")}
          {tab("linkclicks", "Link Clicks")}
        </div>
      </div>
    </section>
  );
}

// =================================================================
// Platforms
// =================================================================
function PlatformSpark({ p }) {
  const seed = p.engagementRate;
  const points = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    const base = Math.sin(t * Math.PI * 1.4) * 0.5 + 0.5;
    const noise = seed * (i + 1) % 7 / 14;
    return base * 0.7 + noise * 0.4;
  });
  const w = 120, h = 38;
  const max = Math.max(...points), min = Math.min(...points);
  const xStep = w / (points.length - 1);
  const path = points.map((v, i) => {
    const x = i * xStep;
    const y = h - (v - min) / (max - min) * h * 0.8 - h * 0.1;
    return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "inline-block", marginLeft: "auto" }}>
      <path d={path} fill="none" stroke="var(--isl-blue)" strokeWidth="1.5" />
    </svg>
  );
}

function Platforms({ data }) {
  return (
    <section className="section wrap" data-screen-label="04 Platforms">
      <header className="section-head"><h2 className="section-title serif">By Platform</h2></header>
      <div className="channels">
        <div className="channel-row is-head">
          <div></div><div>Platform</div>
          <div className="col-num">Followers</div><div className="col-num">Engagement Rate</div>
          <div className="col-num">Page Reach</div><div className="col-num hide-apple">Page Clicks</div>
          <div className="col-num">Trends</div>
        </div>
        {data.platforms.map((p, i) => (
          <div className="channel-row" key={p.key}>
            <div className="channel-idx serif ital">{String(i + 1).padStart(2, "0")}.</div>
            <div><div className="channel-name serif">{p.name}</div><div className="channel-note">{p.note}</div></div>
            <div className="col-num"><span className="big serif num">{fmtExact(p.followers)}</span><span className="sub"><span className={"delta " + p.followersDelta.dir}>{arrow(p.followersDelta.dir)} {p.followersDelta.pct.toFixed(1)}%</span></span></div>
            <div className="col-num"><span className="big serif num">{p.engagementRate.toFixed(2)}%</span><span className="sub"><span className={"delta " + p.engagementRateDelta.dir}>{arrow(p.engagementRateDelta.dir)} {p.engagementRateDelta.pct.toFixed(1)}%</span></span></div>
            <div className="col-num"><span className="big serif num">{fmt(p.pageReach)}</span><span className="sub"><span className={"delta " + p.pageReachDelta.dir}>{arrow(p.pageReachDelta.dir)} {p.pageReachDelta.pct.toFixed(1)}%</span></span></div>
            <div className="col-num hide-apple"><span className="big serif num">{fmtExact(p.pageClicks)}</span><span className="sub"><span className={"delta " + p.pageClicksDelta.dir}>{arrow(p.pageClicksDelta.dir)} {p.pageClicksDelta.pct.toFixed(1)}%</span></span></div>
            <div className="col-num"><PlatformSpark p={p} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

// =================================================================
// Top Posts
// =================================================================
function TopPosts({ data, platform, setPlatform }) {
  const posts = data.topPostsByPlatform[platform] || [];
  return (
    <section className="section wrap" data-screen-label="05 Top Posts">
      <header className="section-head"><h2 className="section-title serif">Top Posts</h2></header>
      <div className="platform-tabs">
        {["linkedin", "facebook", "instagram"].map((k) => (
          <button key={k} className={"platform-tab" + (platform === k ? " is-active" : "")} onClick={() => setPlatform(k)}>
            <span className="serif">{k === "linkedin" ? "LinkedIn" : k === "facebook" ? "Facebook" : "Instagram"}</span>
          </button>
        ))}
      </div>
      <table className="table">
        <thead><tr><th>Post</th><th className="r">Impressions</th><th className="r">Reactions</th><th className="r">Shares</th><th className="r">Engagement</th></tr></thead>
        <tbody>
          {posts.map((c) => {
            const engagement = (c.likes + c.shares) / c.impressions * 100;
            return (
              <tr key={c.title}>
                <td><span className={"flag " + (c.flag || "")}></span><span className="campaign-name serif">{c.title}</span><div className="campaign-chan">{platform}</div></td>
                <td className="r num">{fmtExact(c.impressions)}</td>
                <td className="r num">{c.likes}</td>
                <td className="r num">{c.shares}</td>
                <td className="r num" style={{ color: engagement >= 5 ? "var(--up)" : "var(--ink)" }}>{engagement.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// =================================================================
// All Posts
// =================================================================
function AllPosts({ data }) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState({ key: "Date", dir: "desc" });
  const [view, setView] = useState("list");

  const toggleSort = (key) => setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));
  const sortArrow = (key) => sort.key !== key
    ? <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>
    : <span style={{ marginLeft: 4 }}>{sort.dir === "desc" ? "↓" : "↑"}</span>;

  const posts = (data.allPosts || [])
    .filter((p) => {
      const matchPlatform = platform === "all" || (p.Platforms || "").toLowerCase().includes(platform);
      const query = search.toLowerCase().trim();
      const searchable = [p["Post Name"], p.Notes, p["Post Type"], p.Type].filter(Boolean).join(" ").toLowerCase();
      const matchSearch = !query || searchable.includes(query);
      return matchPlatform && matchSearch;
    })
    .sort((a, b) => {
      const dir = sort.dir === "desc" ? -1 : 1;
      if (sort.key === "Date") return dir * (new Date(a.Date) - new Date(b.Date));
      if (sort.key === "EngRate") {
        const erA = a.Impressions > 0 ? (a.Engagements / a.Impressions) * 100 : 0;
        const erB = b.Impressions > 0 ? (b.Engagements / b.Impressions) * 100 : 0;
        return dir * (erA - erB);
      }
      return dir * ((a[sort.key] || 0) - (b[sort.key] || 0));
    });

  const thStyle = { cursor: "pointer", userSelect: "none" };
  const inputStyle = { border: "1px solid var(--rule)", padding: "8px 12px", fontFamily: "var(--sans)", fontSize: "14px", borderRadius: "2px", background: "var(--paper)", color: "var(--ink)" };
  const calendarMonths = posts.reduce((acc, p) => {
    const d = p.Date ? new Date(p.Date) : null;
    const key = d && !Number.isNaN(d.getTime())
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const calendarKeys = Object.keys(calendarMonths).sort((a, b) => b.localeCompare(a));
  const healthForER = (er) => {
    const label = er > 10 ? "Very Strong" : er >= 6 ? "Strong" : er >= 4 ? "Moderate" : "Low";
    const color = er > 10 ? "var(--isl-blue)" : er >= 6 ? "var(--up)" : er >= 4 ? "#b87000" : "var(--down)";
    return { label, color };
  };

  return (
    <section className="section wrap" data-screen-label="07 All Posts">
      <header className="section-head"><h2 className="section-title serif">All Posts</h2></header>
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <input type="search" placeholder="Search posts, notes, or post type..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, width: "320px" }} />
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inputStyle}>
            <option value="all">All platforms</option>
            <option value="linkedin">LinkedIn</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <span style={{ fontSize: "13px", color: "var(--ink-3)", alignSelf: "center" }}>{posts.length} posts</span>
        </div>
        <div className="view-toggle">
          <button className={"toggle-btn" + (view === "list" ? " is-active" : "")} onClick={() => setView("list")}>List</button>
          <button className={"toggle-btn" + (view === "calendar" ? " is-active" : "")} onClick={() => setView("calendar")}>Calendar</button>
        </div>
      </div>
      {view === "list" ? <div style={{ maxHeight: "560px", overflowY: "auto" }}>
        <table className="table" style={{ marginBottom: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--paper)", zIndex: 2 }}>
            <tr>
              <th>Post</th>
              <th style={thStyle} onClick={() => toggleSort("Date")}>Date{sortArrow("Date")}</th>
              <th>Platforms</th>
              <th className="r" style={thStyle} onClick={() => toggleSort("Impressions")}>Impressions{sortArrow("Impressions")}</th>
              <th className="r" style={thStyle} onClick={() => toggleSort("Engagements")}>Engagements{sortArrow("Engagements")}</th>
              <th className="r" style={thStyle} onClick={() => toggleSort("EngRate")}>Eng. Rate{sortArrow("EngRate")}</th>
              <th className="health-col">Health</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => {
              const date = p.Date ? new Date(p.Date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
              const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
              const label = er > 10 ? "Very Strong" : er >= 6 ? "Strong" : er >= 4 ? "Moderate" : "Low";
              const color = er > 10 ? "var(--isl-blue)" : er >= 6 ? "var(--up)" : er >= 4 ? "#b87000" : "var(--down)";
              return (
                <tr key={i}>
                  <td>
                    <div className="campaign-name serif">
                      {p.URL ? <a href={p.URL} target="_blank" rel="noopener" style={{ color: "#0070CA", textDecoration: "none" }}>{p["Post Name"] || "—"}</a> : p["Post Name"] || "—"}
                    </div>
                    {p.Notes && <div className="campaign-chan">{p.Notes}</div>}
                  </td>
                  <td style={{ color: "var(--ink-3)", fontSize: "13px", whiteSpace: "nowrap" }}>{date}</td>
                  <td style={{ color: "var(--ink-3)", fontSize: "13px" }}>{p.Platforms || "—"}</td>
                  <td className="r num">{(p.Impressions || 0).toLocaleString()}</td>
                  <td className="r num">{(p.Engagements || 0).toLocaleString()}</td>
                  <td className="r num">{er.toFixed(2)}%</td>
                  <td className="health-col"><span style={{ color, fontSize: "13px", fontWeight: 500 }}>{label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div> :
      <div className="calendar-view">
        {calendarKeys.map((monthKey) => {
          const monthPosts = calendarMonths[monthKey];
          if (monthKey === "unknown") {
            return (
              <div key={monthKey} className="calendar-month">
                <h3 className="calendar-month-title serif">Unknown date</h3>
                <div className="calendar-grid-unknown">
                  {monthPosts.map((p, i) => {
                    const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
                    const { color } = healthForER(er);
                    return (
                      <article key={`${monthKey}-${i}`} className="calendar-post" style={{ "--health-color": color }}>
                        <div className="calendar-post-title">{p["Post Name"] || "—"}</div>
                        <div className="calendar-post-meta">{p.Platforms || "—"} · ER {er.toFixed(2)}%</div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          }
          const [year, month] = monthKey.split("-").map(Number);
          const firstDay = new Date(year, month - 1, 1);
          const daysInMonth = new Date(year, month, 0).getDate();
          const startOffset = firstDay.getDay();
          const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
          const label = firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" });
          const dayToPosts = {};
          monthPosts.forEach((p) => {
            const d = new Date(p.Date);
            if (!Number.isNaN(d.getTime())) {
              const day = d.getDate();
              if (!dayToPosts[day]) dayToPosts[day] = [];
              dayToPosts[day].push(p);
            }
          });
          return (
            <div key={monthKey} className="calendar-month">
              <h3 className="calendar-month-title serif">{label}</h3>
              <div className="calendar-weekdays">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="calendar-grid-month">
                {Array.from({ length: totalCells }, (_, idx) => {
                  const dayNumber = idx - startOffset + 1;
                  const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
                  const postsForDay = inMonth ? (dayToPosts[dayNumber] || []) : [];
                  return (
                    <div key={idx} className={"calendar-day-cell" + (inMonth ? "" : " is-pad")}>
                      {inMonth ? <div className="calendar-day-number serif">{dayNumber}</div> : null}
                      <div className="calendar-day-posts">
                        {postsForDay.map((p, i) => {
                          const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
                          const { color, label } = healthForER(er);
                          return (
                            <article key={`${idx}-${i}`} className="calendar-post" style={{ "--health-color": color }} title={`${label} · ER ${er.toFixed(2)}%`}>
                              <div className="calendar-post-title">{p["Post Name"] || "—"}</div>
                              <div className="calendar-post-meta">{p.Platforms || "—"} · {er.toFixed(2)}%</div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>}
    </section>
  );
}

// =================================================================
// Notes
// =================================================================
function Notes({ data }) {
  return (
    <section className="section wrap" data-screen-label="06 Notes">
      <header className="section-head"><h2 className="section-title serif">Insights</h2></header>
      <div className="notes">
        <div className="note working"><h4>Working</h4><ul>{data.notes.working.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
        <div className="note notworking"><h4>Not working</h4><ul>{data.notes.notWorking.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
        <div className="note"><h4>Actions</h4><ul>{data.notes.actions.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
        <div className="note"><h4>Next quarter</h4><ul>{data.notes.next.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
      </div>
    </section>
  );
}

// =================================================================
// Colophon
// =================================================================
function Colophon({ data }) {
  return (
    <footer className="wrap colophon">
      <div className="left serif">{data.meta.agencyName} — Quarterly Marketing Report.<br />{data.meta.quarter} {data.meta.year}, {data.meta.rangeLabel}.</div>
      <div className="right"><div className="upper">Internal — Do Not Distribute</div><div style={{ marginTop: 8 }}>{data.meta.generatedLabel}</div></div>
    </footer>
  );
}

// =================================================================
// App
// =================================================================
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [metric, setMetric] = useState(t.trendMetric || "impressions");
  const [platform, setPlatform] = useState(t.topPlatform || "linkedin");
  const [data, setData] = useState(null);

  // Apply layout/density/accent tweaks to body
  useEffect(() => {
    document.body.setAttribute("data-layout", t.layout);
    document.body.setAttribute("data-density", t.density);
    document.body.setAttribute("data-accent", t.accent);
    const accentColor = t.accent === "graphite" ? "#2a2622" : t.accent === "none" ? "#14110d" : "#0a4d8c";
    document.documentElement.style.setProperty("--isl-blue", accentColor);
  }, [t.layout, t.density, t.accent]);

  // Update page title once data is ready
  useEffect(() => {
    if (data) document.title = `${data.meta.agencyName} ${data.meta.quarter} ${data.meta.year}`;
  }, [data]);

  // Poll for ISL_REPORT (set by the inline script in index.html)
  useEffect(() => {
    const poll = setInterval(() => {
      if (window.ISL_REPORT) {
        setData(normalizeReport(window.ISL_REPORT));
        clearInterval(poll);
      }
    }, 50);
    return () => clearInterval(poll);
  }, []);

  // Render nav (masthead + tabs + quarter chooser) once on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const agency = params.get("agency") || "isl";
    const reportKey = params.get("report") || (agency + "q3");
    const QUARTER_META = {
      q1: { label: "Q1", rangeLabel: "Sep – Nov 2025" },
      q2: { label: "Q2", rangeLabel: "Dec – Feb 2026" },
      q3: { label: "Q3", rangeLabel: "Mar – May 2026" },
    };
    const suffix = (reportKey.match(/q\d+$/) || ["q3"])[0];
    const quarter = { key: reportKey, ...(QUARTER_META[suffix] || QUARTER_META.q3) };
    renderNav("social", quarter, true);
  }, []);

  // Hide loading screen once data has arrived
  useEffect(() => {
    if (data) hideLoadingScreen();
  }, [data]);

  // While data is loading, render nothing — nav.jsx loading screen is already visible
  if (!data) return null;

  return (
    <React.Fragment>
      <main className="report-wrap">
        <Hero data={data} />
        <Numbers data={data} />
        <Trend data={data} metric={metric} setMetric={setMetric} />
        <Platforms data={data} />
        <TopPosts data={data} platform={platform} setPlatform={setPlatform} />
        <AllPosts data={data} />
        <Notes data={data} />
      </main>
      <Colophon data={data} />
      <TweaksPanel title="Tweaks">
        <TweakSection title="Layout">
          <TweakRadio label="Mode" value={t.layout} onChange={(v) => setTweak("layout", v)} options={[{value:"editorial",label:"Editorial"},{value:"apple",label:"Apple"},{value:"document",label:"Document"}]} />
          <TweakRadio label="Density" value={t.density} onChange={(v) => setTweak("density", v)} options={[{value:"airy",label:"Airy"},{value:"balanced",label:"Balanced"},{value:"tight",label:"Tight"}]} />
        </TweakSection>
        <TweakSection title="Accent">
          <TweakColor label="Accent color" value={t.accent === "isl" ? "#0a4d8c" : t.accent === "graphite" ? "#2a2622" : "#14110d"} onChange={(v) => { const map={"#0a4d8c":"isl","#2a2622":"graphite","#14110d":"none"}; setTweak("accent", map[v]||"isl"); }} options={["#0a4d8c","#2a2622","#14110d"]} />
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
