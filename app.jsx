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

// parseDelta and arrow are defined in nav.jsx (loaded first) as shared globals.

const SAFE_DELTA = { dir: "flat", pct: 0 };

// =================================================================
// Helpers
// =================================================================
const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  if (typeof n !== "number") return String(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return Math.round(n / 1000) + "K";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
};
const fmtExact = (n) => (n === null || n === undefined ? "—" : typeof n === "number" ? n.toLocaleString() : "—");

// =================================================================
// normalizeReport — pure function, does not mutate its input.
// agency and reportKey come from the caller (URL params read once in App).
// =================================================================
function normalizeReport(r, agency, reportKey) {
  if (!r) return r;

  // Already-normalized shape (has overall + platforms with parsed deltas)
  if (r.overall && r.platforms) {
    const parsedDeltas = r.deltas
      ? Object.fromEntries(Object.entries(r.deltas).map(([k, v]) => [k, parseDelta(v)]))
      : {};
    const parsedPlatforms = Array.isArray(r.platforms)
      ? r.platforms.map((p) => ({
          ...p,
          followersDelta:      parseDelta(p.followersDelta),
          engagementRateDelta: parseDelta(p.engagementRateDelta),
          pageReachDelta:      parseDelta(p.pageReachDelta),
          pageClicksDelta:     parseDelta(p.pageClicksDelta),
        }))
      : r.platforms;
    return { ...r, deltas: parsedDeltas, platforms: parsedPlatforms };
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
    working:    insightMap.working    ? [insightMap.working]    : [],
    notWorking: insightMap.notWorking ? [insightMap.notWorking] : [],
    actions:    insightMap.actions    ? [insightMap.actions]    : [],
    next:       insightMap.next       ? [insightMap.next]       : [],
  };

  const weekly = Array.from({ length: 13 }, (_, i) => ({ wk: i + 1, imp: 0, leads: 0, spend: 0 }));

  // Quarter meta comes from nav.jsx's QUARTERS (single source of truth)
  const suffix = (reportKey.match(/q\d+$/) || ["q3"])[0];
  const qMeta = getQuarterBySuffix(suffix);

  const AGENCY_NAMES = { isl: "Integrated Staffing", as: "Accountant Staffing", ads: "Administrative Staffing" };

  const meta = {
    quarter:        qMeta.label,
    quarterWord:    qMeta.quarterWord,
    year:           qMeta.year,
    rangeLabel:     qMeta.rangeLabel,
    generatedLabel: r.generatedAt ? new Date(r.generatedAt).toLocaleDateString() : "",
    author:         "Josiah Yule",
    issue:          qMeta.issue,
    agencyName:     AGENCY_NAMES[agency] || "Integrated Staffing",
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
      <div className="hero-b-top">
        <div className="hero-b-left">
          <div className="hero-b-q serif">{data.meta.quarter}</div>
          <div className="hero-b-divider"></div>
          <div className="hero-b-meta">
            <div className="hero-b-meta-name">{data.meta.agencyName}</div>
            <div className="hero-b-meta-range">{data.meta.rangeLabel}</div>
          </div>
        </div>
        <div className="hero-b-type">Social Media</div>
      </div>
      <p className="hero-b-note serif">
        {data.editorsNote.split(/(\bLinkedIn\b|\bFacebook\b|\bInstagram\b)/).map((part, i) =>
          part === "LinkedIn" || part === "Facebook" || part === "Instagram"
            ? <em key={i}>{part}</em>
            : <React.Fragment key={i}>{part}</React.Fragment>
        )}
      </p>
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
  { key: "avgengagementrate", label: "Avg Engagement Rate", fmt: (v) => v != null ? v.toFixed(2) + "%" : "—", note: "blended across posts" },
];

function Numbers({ data }) {
  return (
    <section className="section wrap" data-screen-label="02 Numbers">
      <header className="section-head"><h2 className="section-title serif">The Numbers</h2></header>
      <div className="kpi-grid">
        {KPI_DEFS.map((k) => {
          const v = data.overall[k.key];
          const d = data.deltas?.[k.key] || SAFE_DELTA;
          return (
            <div className="kpi" key={k.key}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value num">{k.fmt(v)}</div>
              <div className="kpi-foot">
                <span className={"delta " + d.dir} aria-label={`${d.dir === "up" ? "increased" : d.dir === "down" ? "decreased" : "unchanged"} ${d.pct.toFixed(1)} percent`}><span className="arrow serif ital" aria-hidden="true">{arrow(d.dir)}</span><span>{d.pct.toFixed(1)}%</span></span>
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
  const rawMax = Math.max(...active.values);
  const max = rawMax > 0 ? rawMax * 1.15 : 1, min = 0;
  const range = max - min;
  const xStep = (w - padL - padR) / Math.max(active.values.length - 1, 1);
  const points = active.values.map((v, i) => [padL + i * xStep, padT + (h - padT - padB) * (1 - (v - min) / range)]);
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath = path + ` L${points[points.length - 1][0]},${h - padB} L${points[0][0]},${h - padB} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: min + range * t, y: padT + (h - padT - padB) * (1 - t) }));
  const avg = active.values.reduce((a, b) => a + b, 0) / active.values.length;
  const peakIdx = active.values.indexOf(rawMax);

  const chartId = "trend-chart-title";
  return (
    <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={chartId}>
      <title id={chartId}>{active.name} — week by week</title>
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
      <line x1={padL} x2={w - padR} y1={padT + (h - padT - padB) * (1 - (avg - min) / range)} y2={padT + (h - padT - padB) * (1 - (avg - min) / range)} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 4" />
      <text x={w - padR} y={padT + (h - padT - padB) * (1 - (avg - min) / range) - 6} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">avg {avg < 10 ? avg.toFixed(1) : Math.round(avg)}{active.unit}</text>
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
function Platforms({ data }) {
  return (
    <section className="section wrap" data-screen-label="04 Platforms">
      <header className="section-head"><h2 className="section-title serif">By Platform</h2></header>
      <div className="channels">
        <div className="channel-row is-head">
          <div></div><div>Platform</div>
          <div className="col-num">Followers</div><div className="col-num">Engagement Rate</div>
          <div className="col-num">Page Reach</div><div className="col-num hide-apple">Page Clicks</div>
        </div>
        {data.platforms.map((p, i) => (
          <div className="channel-row" key={p.key}>
            <div className="channel-idx serif ital">{String(i + 1).padStart(2, "0")}.</div>
            <div><div className="channel-name serif">{p.name}</div><div className="channel-note">{p.note}</div></div>
            <div className="col-num"><span className="big serif num">{fmtExact(p.followers)}</span><span className="sub"><span className={"delta " + p.followersDelta.dir}>{arrow(p.followersDelta.dir)} {p.followersDelta.pct != null ? p.followersDelta.pct.toFixed(1) : "—"}%</span></span></div>
            <div className="col-num"><span className="big serif num">{p.engagementRate != null ? p.engagementRate.toFixed(2) : "—"}%</span><span className="sub"><span className={"delta " + p.engagementRateDelta.dir}>{arrow(p.engagementRateDelta.dir)} {p.engagementRateDelta.pct != null ? p.engagementRateDelta.pct.toFixed(1) : "—"}%</span></span></div>
            <div className="col-num"><span className="big serif num">{fmt(p.pageReach)}</span><span className="sub"><span className={"delta " + p.pageReachDelta.dir}>{arrow(p.pageReachDelta.dir)} {p.pageReachDelta.pct != null ? p.pageReachDelta.pct.toFixed(1) : "—"}%</span></span></div>
            <div className="col-num hide-apple"><span className="big serif num">{fmtExact(p.pageClicks)}</span><span className="sub"><span className={"delta " + p.pageClicksDelta.dir}>{arrow(p.pageClicksDelta.dir)} {p.pageClicksDelta.pct != null ? p.pageClicksDelta.pct.toFixed(1) : "—"}%</span></span></div>
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
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">Post</th><th scope="col" className="r">Impressions</th><th scope="col" className="r">Reactions</th><th scope="col" className="r">Shares</th><th scope="col" className="r">Engagement</th></tr></thead>
        <tbody>
          {posts.map((c) => {
            const engagement = c.impressions > 0 ? (c.likes + c.shares) / c.impressions * 100 : 0;
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
      </table></div>
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
    <section className="section wrap" data-screen-label="06 All Posts">
      <header className="section-head"><h2 className="section-title serif">All Posts</h2></header>
      <div className="all-posts-controls">
        <div className="all-posts-controls-left">
          <input type="search" className="all-posts-input" placeholder="Search posts, notes, or post type..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="all-posts-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">All platforms</option>
            <option value="linkedin">LinkedIn</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <span className="all-posts-count">{posts.length} posts</span>
        </div>
        <div className="view-toggle">
          <button className={"toggle-btn" + (view === "list" ? " is-active" : "")} onClick={() => setView("list")}>List</button>
          <button className={"toggle-btn" + (view === "calendar" ? " is-active" : "")} onClick={() => setView("calendar")}>Calendar</button>
        </div>
      </div>
      {view === "list" ? <div className="all-posts-list-wrap">
        <table className="table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th scope="col">Post</th>
              <th scope="col" style={thStyle} onClick={() => toggleSort("Date")}>Date{sortArrow("Date")}</th>
              <th scope="col">Platforms</th>
              <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("Impressions")}>Impressions{sortArrow("Impressions")}</th>
              <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("Engagements")}>Engagements{sortArrow("Engagements")}</th>
              <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("EngRate")}>Eng. Rate{sortArrow("EngRate")}</th>
              <th scope="col" className="health-col">Health</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => {
              const date = p.Date ? new Date(p.Date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
              const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
              const { label, color } = healthForER(er);
              const rowKey = (p["Post Name"] || "") + (p.Date || "") + i;
              return (
                <tr key={rowKey}>
                  <td>
                    <div className="campaign-name serif">
                      {p.URL ? <a href={p.URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--isl-blue)", textDecoration: "none" }}>{p["Post Name"] || "—"}</a> : p["Post Name"] || "—"}
                    </div>
                    {p.Notes && <div className="campaign-chan">{p.Notes}</div>}
                  </td>
                  <td className="all-posts-cell-date">{date}</td>
                  <td className="all-posts-cell-platform">{p.Platforms || "—"}</td>
                  <td className="r num">{(p.Impressions || 0).toLocaleString()}</td>
                  <td className="r num">{(p.Engagements || 0).toLocaleString()}</td>
                  <td className="r num">{er.toFixed(2)}%</td>
                  <td className="health-col"><span className="health-label" style={{ color }}>{label}</span></td>
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
function NoteList({ items }) {
  if (!items.length) return <p className="note-empty">No notes yet.</p>;
  return <ul>{items.map((n, i) => <li key={i}>{n}</li>)}</ul>;
}

function Notes({ data }) {
  return (
    <section className="section wrap" data-screen-label="07 Notes">
      <header className="section-head"><h2 className="section-title serif">Insights</h2></header>
      <div className="notes">
        <div className="note working"><h4>Working</h4><NoteList items={data.notes.working} /></div>
        <div className="note notworking"><h4>Not working</h4><NoteList items={data.notes.notWorking} /></div>
        <div className="note"><h4>Actions</h4><NoteList items={data.notes.actions} /></div>
        <div className="note"><h4>Next quarter</h4><NoteList items={data.notes.next} /></div>
      </div>
    </section>
  );
}

// =================================================================
// Colophon
// =================================================================
function Colophon() {
  return (
    <footer className="wrap colophon">Prepared by Josiah Yule</footer>
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
  const [loadError, setLoadError] = useState("");

  // Read URL params once — used by poll effect and normalizeReport
  const params = new URLSearchParams(window.location.search);
  const agency = params.get("agency") || "isl";
  const reportKey = params.get("report") || (agency + "q3");

  // Set page title immediately from URL params (before data loads)
  useEffect(() => {
    const AGENCY_NAMES = { isl: "Integrated Staffing", as: "Accountant Staffing", ads: "Administrative Staffing" };
    const suffix = (reportKey.match(/q\d+$/) || ["q3"])[0];
    const qMeta = getQuarterBySuffix(suffix);
    document.title = `${AGENCY_NAMES[agency] || "Integrated Staffing"} ${qMeta.label} ${qMeta.year}`;
  }, []);

  // Apply layout/density/accent tweaks to body
  useEffect(() => {
    document.body.setAttribute("data-layout", t.layout);
    document.body.setAttribute("data-density", t.density);
    document.body.setAttribute("data-accent", t.accent);
    const accentColor = t.accent === "graphite" ? "#2a2622" : t.accent === "none" ? "#14110d" : "#0a4d8c";
    document.documentElement.style.setProperty("--isl-blue", accentColor);
  }, [t.layout, t.density, t.accent]);

  // Poll for ISL_REPORT (set by the inline script in index.html)
  useEffect(() => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (window.ISL_REPORT) {
        setData(normalizeReport(window.ISL_REPORT, agency, reportKey));
        clearInterval(poll);
        return;
      }
      const status = window.ISL_REPORT_STATUS;
      if (status?.state === "error") {
        setLoadError(status.error || "Unable to load report data.");
        clearInterval(poll);
        return;
      }
      if (Date.now() - started > 15000) {
        setLoadError("Loading timed out. Please refresh and try again.");
        clearInterval(poll);
      }
    }, 50);
    return () => clearInterval(poll);
  }, []);

  // Render nav (masthead + tabs + quarter chooser) once on mount
  useEffect(() => {
    const suffix = (reportKey.match(/q\d+$/) || ["q3"])[0];
    const qMeta = getQuarterBySuffix(suffix);
    const quarter = { key: reportKey, label: qMeta.label, rangeLabel: qMeta.rangeLabel };
    renderNav("social", quarter, true);
  }, []);

  // Hide loading screen once data or an error has arrived
  useEffect(() => {
    if (data) hideLoadingScreen();
  }, [data]);

  useEffect(() => {
    if (loadError) hideLoadingScreen();
  }, [loadError]);

  if (loadError) {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head"><h2 className="section-title serif">Unable to load report</h2></header>
          <div className="error-section">
            <p>{loadError}</p>
            <button className="error-retry-btn" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

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
      <Colophon />
      <TweaksPanel title="Tweaks">
        <TweakSection label="Layout">
          <TweakRadio label="Mode" value={t.layout} onChange={(v) => setTweak("layout", v)} options={[{value:"editorial",label:"Editorial"},{value:"apple",label:"Apple"},{value:"document",label:"Document"}]} />
          <TweakRadio label="Density" value={t.density} onChange={(v) => setTweak("density", v)} options={[{value:"airy",label:"Airy"},{value:"balanced",label:"Balanced"},{value:"tight",label:"Tight"}]} />
        </TweakSection>
        <TweakSection label="Accent">
          <TweakColor label="Accent color" value={t.accent === "isl" ? "#0a4d8c" : t.accent === "graphite" ? "#2a2622" : "#14110d"} onChange={(v) => { const map={"#0a4d8c":"isl","#2a2622":"graphite","#14110d":"none"}; setTweak("accent", map[v]||"isl"); }} options={["#0a4d8c","#2a2622","#14110d"]} />
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
