import React, { useState, useMemo, useEffect } from "react";
import { useSocialReport } from "../hooks/useSocialReport.js";
import { useSocialKpiHistory } from "../hooks/useSocialKpiHistory.js";
import { Delta } from "../components/Delta.jsx";
import { PageLoader } from "../components/PageLoader.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { EmptyNote, EmptyData } from "../components/EmptyState.jsx";
import { fmt, fmtExact, FLAT } from "../utils.js";
import { IconSort, IconArrowUp, IconArrowDown } from "../components/Icons.jsx";
import { CountUp } from "../components/CountUp.jsx";
import { SectionRail } from "../components/SectionRail.jsx";

// ─── Hero ─────────────────────────────────────────────────────────
function Hero({ data }) {
  return (
    <section className="hero wrap">
      <div className="hero-b-top">
        <div className="hero-b-left">
          <div className="hero-b-q serif">{data.meta.quarter}</div>
          <div className="hero-b-divider" />
          <div className="hero-b-meta">
            <div className="hero-b-meta-name">{data.meta.agencyName}</div>
            <div className="hero-b-meta-range">{data.meta.rangeLabel}</div>
          </div>
        </div>
        <div className="hero-b-type">Social Media</div>
      </div>
      {data.editorsNote && (
        <p className="hero-b-note">{data.editorsNote}</p>
      )}
    </section>
  );
}

// ─── KPI grid ─────────────────────────────────────────────────────
const KPI_DEFS = [
  { key: "posts",             label: "Posts Published",     fmt: fmtExact, note: "across all platforms" },
  { key: "impressions",       label: "Impressions",         fmt: fmt,      note: "total reach served" },
  { key: "shares",            label: "Shares",              fmt: fmtExact, note: "amplification by audience" },
  { key: "reactions",         label: "Reactions",           fmt: fmtExact, note: "likes + reactions" },
  { key: "followers",         label: "Followers",           fmt: fmtExact, note: "combined audience" },
  { key: "linkclicks",        label: "Link Clicks",         fmt: fmtExact, note: "engagement with posts" },
  { key: "comments",          label: "Comments",            fmt: fmtExact, note: "depth of conversation" },
  { key: "avgengagementrate", label: "Avg Engagement Rate", fmt: v => v != null ? v.toFixed(2) + "%" : "—", note: "blended across posts" },
];

function Numbers({ data }) {
  return (
    <section id="numbers" className="section wrap kpi-section" aria-label="Key performance indicators">
      <header className="section-head">
        <h2 className="section-title serif">The <em>Numbers</em></h2>
      </header>
      <div className="kpi-grid">
        {KPI_DEFS.map((k, i) => {
          const v = data.overall[k.key];
          const d = data.deltas?.[k.key] || FLAT;
          return (
            <div className="kpi" key={k.key} style={{ "--i": i }}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value num"><CountUp value={v} format={k.fmt} /></div>
              <div className="kpi-foot">
                <Delta d={d} />
                <span className="delta-note">{k.note}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── KPI history (quarter-by-quarter line chart) ──────────────────
function KpiHistoryChart({ history, kpiDef }) {
  const W = 880, H = 260, pL = 68, pR = 64, pT = 28, pB = 56;
  const vals = history.map(q => (q.kpis ? q.kpis[kpiDef.key] : null));
  const defined = vals.filter(v => v != null);
  if (defined.length === 0) {
    return <div className="kpi-history-empty">No data recorded yet</div>;
  }
  const rawMax = Math.max(...defined);
  const max    = rawMax > 0 ? rawMax * 1.15 : 1;
  const n      = history.length;
  const xStep  = (W - pL - pR) / Math.max(n - 1, 1);
  const pts    = history.map((q, i) => {
    const v = q.kpis ? q.kpis[kpiDef.key] : null;
    return { x: pL + i * xStep, y: v != null ? pT + (H - pT - pB) * (1 - v / max) : null, v, q };
  });

  let pathSegs = "", inSeg = false;
  pts.forEach(p => {
    if (p.v != null) {
      pathSegs += inSeg
        ? ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`
        : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      inSeg = true;
    } else {
      inSeg = false;
    }
  });

  const allPresent = vals.every(v => v != null);
  const areaPath   = allPresent && pts.length > 0
    ? pathSegs
        + ` L${pts[pts.length - 1].x.toFixed(1)},${(H - pB).toFixed(1)}`
        + ` L${pts[0].x.toFixed(1)},${(H - pB).toFixed(1)} Z`
    : "";

  const peakIdx = vals.indexOf(rawMax);
  const avg     = defined.reduce((a, b) => a + b, 0) / defined.length;
  const avgY    = pT + (H - pT - pB) * (1 - avg / max);
  const ticks   = [0, 0.25, 0.5, 0.75, 1].map(t => ({ v: max * t, y: pT + (H - pT - pB) * (1 - t) }));

  const fmtAxis = v => {
    if (kpiDef.key === "avgengagementrate") return v.toFixed(1) + "%";
    return fmt(v);
  };
  const fmtAvg = v => {
    if (kpiDef.key === "avgengagementrate") return v.toFixed(2) + "%";
    return fmt(v);
  };

  return (
    <svg className="kpi-history-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
         role="img" aria-label={`${kpiDef.label} — quarter by quarter`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pL} x2={W - pR} y1={t.y} y2={t.y} stroke="var(--rule-soft)" strokeWidth="1" />
          <text x={pL - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">
            {fmtAxis(t.v)}
          </text>
        </g>
      ))}
      <line x1={pL} x2={W - pR} y1={H - pB} y2={H - pB} stroke="var(--ink)" strokeWidth="1" />
      {areaPath && <path d={areaPath} fill="var(--accent)" opacity="0.06" />}
      {pathSegs && <path d={pathSegs} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />}
      {pts.map((p, i) =>
        p.v != null ? (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={i === peakIdx ? 5 : 3.5} fill="var(--paper)" stroke="var(--accent)" strokeWidth="2" />
            {i === peakIdx && (
              <text x={p.x} y={p.y - 14} textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="13" fill="var(--accent)">
                peak — {kpiDef.fmt(p.v)}
              </text>
            )}
          </g>
        ) : null
      )}
      {pts.map((p, i) => (
        <g key={i}>
          <text x={p.x} y={H - pB + 18} textAnchor="middle" fontSize="12" fontFamily="var(--serif)" fill="var(--ink-2)" fontWeight="600">
            {p.q.label}
          </text>
          <text x={p.x} y={H - pB + 34} textAnchor="middle" fontSize="10" fontFamily="var(--sans)" fill="var(--ink-4)">
            {p.q.rangeLabel}
          </text>
        </g>
      ))}
      <line x1={pL} x2={W - pR} y1={avgY} y2={avgY} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 4" />
      <text x={W - pR} y={avgY - 6} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">
        avg {fmtAvg(avg)}
      </text>
    </svg>
  );
}

function toNetNewFollowers(history) {
  return history.map((q, i) => {
    if (!q.kpis) return q;
    const prev = history.slice(0, i).reverse().find(p => p.kpis?.followers != null);
    return {
      ...q,
      kpis: { ...q.kpis, followers: prev != null ? q.kpis.followers - prev.kpis.followers : null },
    };
  });
}

function KpiHistory({ history }) {
  const [activeKey, setActiveKey] = useState(KPI_DEFS[1].key); // default: Impressions
  if (!history) return null;
  if (!history.some(q => q.kpis !== null)) return null;

  const isFollowers = activeKey === "followers";
  const chartHistory = isFollowers ? toNetNewFollowers(history) : history;
  const baseDef      = KPI_DEFS.find(k => k.key === activeKey) || KPI_DEFS[1];
  const activeDef    = isFollowers ? { ...baseDef, label: "Net New Followers" } : baseDef;

  return (
    <section id="quarter-by-quarter" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Quarter by <em>Quarter</em></h2>
      </header>
      <div className="kpi-history-body">
        <nav className="kpi-history-nav" aria-label="Select metric">
          {KPI_DEFS.map(k => (
            <button
              key={k.key}
              className={"kpi-history-nav-item" + (activeKey === k.key ? " is-active" : "")}
              onClick={() => setActiveKey(k.key)}
              aria-pressed={activeKey === k.key}
            >
              {k.key === "followers" ? "Net New Followers" : k.label}
            </button>
          ))}
        </nav>
        <div className="kpi-history-chart-wrap">
          <KpiHistoryChart history={chartHistory} kpiDef={activeDef} />
        </div>
      </div>
    </section>
  );
}

// ─── Trend chart ──────────────────────────────────────────────────
function TrendChart({ data, metric }) {
  const W = 1100, H = 320, pL = 56, pR = 20, pT = 30, pB = 40;

  const lines = {
    impressions: { name: "Impressions (K)", values: data.weekly.map(d => d.imp),   color: "var(--accent)", unit: "K" },
    engagements: { name: "Engagements",     values: data.weekly.map(d => d.leads), color: "var(--ink)",    unit: "" },
    linkclicks:  { name: "Link Clicks",     values: data.weekly.map(d => d.spend), color: "var(--ink-3)",  unit: "" },
  };

  const active = lines[metric] || lines.impressions;
  const rawMax = Math.max(...active.values);
  const max = rawMax > 0 ? rawMax * 1.15 : 1;
  const range = max;
  const xStep = (W - pL - pR) / Math.max(active.values.length - 1, 1);
  const pts = active.values.map((v, i) => [pL + i * xStep, pT + (H - pT - pB) * (1 - v / range)]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = path + ` L${pts[pts.length - 1][0]},${H - pB} L${pts[0][0]},${H - pB} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({ v: range * t, y: pT + (H - pT - pB) * (1 - t) }));
  const avg = active.values.reduce((a, b) => a + b, 0) / active.values.length;
  const peakIdx = active.values.indexOf(rawMax);
  const avgY = pT + (H - pT - pB) * (1 - avg / range);

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${active.name} — week by week`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pL} x2={W - pR} y1={t.y} y2={t.y} stroke="var(--rule-soft)" strokeWidth="1" />
          <text x={pL - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">
            {t.v < 10 ? t.v.toFixed(1) : Math.round(t.v)}{active.unit}
          </text>
        </g>
      ))}
      <line x1={pL} x2={W - pR} y1={H - pB} y2={H - pB} stroke="var(--ink)" strokeWidth="1" />
      <path d={area} fill={active.color} opacity="0.06" />
      <path d={path} fill="none" stroke={active.color} strokeWidth="1.5" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={i === peakIdx ? 4 : 2.5} fill="var(--paper)" stroke={active.color} strokeWidth="1.5" />
          {i === peakIdx && (
            <text x={p[0]} y={p[1] - 14} textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontSize="14" fill="var(--accent)">
              peak — {active.values[i] < 10 ? active.values[i].toFixed(1) : active.values[i]}{active.unit}
            </text>
          )}
        </g>
      ))}
      {data.weekly.map((_, i) => (
        <text key={i} x={pL + i * xStep} y={H - pB + 18} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--sans)">
          {i + 1}
        </text>
      ))}
      <line x1={pL} x2={W - pR} y1={avgY} y2={avgY} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 4" />
      <text x={W - pR} y={avgY - 6} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">
        avg {avg < 10 ? avg.toFixed(1) : Math.round(avg)}{active.unit}
      </text>
    </svg>
  );
}

function Trend({ data }) {
  const [metric, setMetric] = useState("impressions");
  if (!data.weekly || data.weekly.every(w => w.imp === 0)) return null;

  const lines = {
    impressions: { vals: data.weekly.map(w => w.imp),   color: "var(--accent)", unit: "K", label: "Impressions" },
    engagements: { vals: data.weekly.map(w => w.leads), color: "var(--ink)",    unit: "",  label: "Engagements" },
    linkclicks:  { vals: data.weekly.map(w => w.spend), color: "var(--ink-3)",  unit: "",  label: "Link Clicks" },
  };

  return (
    <section id="week-by-week" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Week by Week</h2>
      </header>
      <div className="trend-body">
        <TrendChart data={data} metric={metric} />
        <div className="trend-legend" role="group" aria-label="Select metric">
          {Object.entries(lines).map(([key, l]) => {
            const total = l.vals.reduce((a, b) => a + b, 0);
            const display = l.unit === "K" ? Math.round(total) + "K" : Math.round(total).toLocaleString();
            return (
              <span
                key={key}
                className={"legend-item" + (metric === key ? "" : " is-off")}
                onClick={() => setMetric(key)}
                role="button"
                tabIndex={0}
                aria-pressed={metric === key}
                onKeyDown={e => e.key === "Enter" && setMetric(key)}
              >
                <span className="swatch" style={{ background: l.color }} />
                <span>{l.label}</span>
                <span className="v serif num">{display}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Platforms ────────────────────────────────────────────────────
function Platforms({ data }) {
  return (
    <section id="platforms" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">By <em>Platform</em></h2>
      </header>
      <div className="channels" role="grid" aria-label="Platform breakdown">
        <div className="channel-row is-head" role="row">
          <div role="columnheader" />
          <div role="columnheader">Platform</div>
          <div className="col-num" role="columnheader">Followers</div>
          <div className="col-num" role="columnheader">Engagement Rate</div>
          <div className="col-num" role="columnheader">Page Reach</div>
          <div className="col-num" role="columnheader">Page Clicks</div>
        </div>
        {data.platforms.map((p, i) => (
          <div className="channel-row" key={p.key} role="row">
            <div className="channel-idx serif ital" aria-hidden="true">{String(i + 1).padStart(2, "0")}.</div>
            <div>
              <div className="channel-name serif">{p.name}</div>
              {p.note && <div className="channel-note">{p.note}</div>}
            </div>
            <div className="col-num">
              <span className="big serif num">{fmtExact(p.followers)}</span>
              <span className="sub"><Delta d={p.followersDelta} /></span>
            </div>
            <div className="col-num">
              <span className="big serif num">{p.engagementRate != null ? p.engagementRate.toFixed(2) : "—"}%</span>
              <span className="sub"><Delta d={p.engagementRateDelta} /></span>
            </div>
            <div className="col-num">
              <span className="big serif num">{fmt(p.pageReach)}</span>
              <span className="sub"><Delta d={p.pageReachDelta} /></span>
            </div>
            <div className="col-num">
              <span className="big serif num">{fmtExact(p.pageClicks)}</span>
              <span className="sub"><Delta d={p.pageClicksDelta} /></span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Top Posts ────────────────────────────────────────────────────
// The three highest-reach posts this quarter, derived automatically from the
// full post log (social_posts) rather than a hand-curated list. Ranked by
// impressions, with engagements as the tiebreaker. Posts are cross-posted
// across platforms, so this is an overall ranking rather than per-platform.
function TopPosts({ data }) {
  const topPosts = useMemo(() => {
    return (data.allPosts || [])
      .filter(p => Number.isFinite(p.Impressions))
      .slice()
      .sort((a, b) => (b.Impressions - a.Impressions) || ((b.Engagements || 0) - (a.Engagements || 0)))
      .slice(0, 3);
  }, [data.allPosts]);

  return (
    <section id="top-posts" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Top <em>Posts</em></h2>
        <p className="section-sub">The three highest-reach posts this quarter, pulled automatically from the full post log.</p>
      </header>
      {topPosts.length === 0
        ? <EmptyData label="No posts recorded this quarter." />
        : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Post</th>
                  <th scope="col" className="r">Impressions</th>
                  <th scope="col" className="r">Engagements</th>
                  <th scope="col" className="r">Eng. Rate</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p, i) => {
                  const impressions = p.Impressions || 0;
                  const engagements = p.Engagements || 0;
                  const engRate = impressions > 0 ? engagements / impressions * 100 : 0;
                  const name = p["Post Name"] || "Untitled post";
                  return (
                    <tr key={name + i}>
                      <td>
                        <span className="campaign-name serif">
                          {p.URL ? <a href={p.URL} target="_blank" rel="noreferrer">{name}</a> : name}
                        </span>
                        <div className="campaign-chan">{p.Platforms || "—"}</div>
                      </td>
                      <td className="r num">{fmtExact(impressions)}</td>
                      <td className="r num">{fmtExact(engagements)}</td>
                      <td className="r num" style={{ color: engRate >= 5 ? "var(--up)" : "var(--ink)" }}>
                        {engRate.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

// ─── All Posts ────────────────────────────────────────────────────
// Most posts a single calendar day shows before collapsing the rest behind
// a "+N more" disclosure, so a busy day can't stretch its whole week row.
const CAL_MAX_PER_DAY = 3;

// Parse a post's date as a *local* calendar day. Postgres `date` columns
// serialize as "YYYY-MM-DD", which `new Date()` reads as UTC midnight — that
// shifts the day backwards for any viewer west of UTC (e.g. the report's
// America/Halifax timezone), landing posts on the wrong day and sometimes the
// wrong month. Building the Date from local parts keeps it on the posted day.
function parsePostDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Engagement-rate "health" for a post. A post with no impressions yet has no
// measurable rate, so it reads as a neutral "No data" rather than a red "Low" —
// unmeasured posts shouldn't look like failures.
function healthForPost(p) {
  const impressions = p.Impressions || 0;
  const engagements = p.Engagements || 0;
  if (impressions <= 0) {
    return { label: "No data", color: "var(--ink-4)", er: null, hasData: false };
  }
  const er = (engagements / impressions) * 100;
  const label = er > 10 ? "Very Strong" : er >= 6 ? "Strong" : er >= 4 ? "Moderate" : "Low";
  const color = er > 10 ? "var(--accent)" : er >= 6 ? "var(--up)" : er >= 4 ? "#b87000" : "var(--down)";
  return { label, color, er, hasData: true };
}

const PLATFORM_META = {
  linkedin:  { key: "linkedin",  short: "LI", label: "LinkedIn"  },
  facebook:  { key: "facebook",  short: "FB", label: "Facebook"  },
  instagram: { key: "instagram", short: "IG", label: "Instagram" },
};

// Split the free-text Platforms field ("LinkedIn, Facebook") into compact
// badges, keeping anything unrecognised as its own labelled chip.
function parsePlatforms(value) {
  if (!value) return [];
  return String(value)
    .split(/[,/&|]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(token => PLATFORM_META[token.toLowerCase()] || { key: "other", short: token, label: token });
}

function CalendarPost({ p }) {
  const { label, color, er, hasData } = healthForPost(p);
  const platforms = parsePlatforms(p.Platforms);
  const erText = hasData ? er.toFixed(1) + "%" : "—";
  const Tag = p.URL ? "a" : "article";
  const linkProps = p.URL ? { href: p.URL, target: "_blank", rel: "noopener noreferrer" } : {};
  const aria = `${p["Post Name"] || "Untitled post"} — ${platforms.map(pl => pl.label).join(", ") || "platform unknown"}, engagement ${erText}, ${label}`;
  return (
    <Tag
      className={"calendar-post" + (p.URL ? " is-link" : "")}
      style={{ "--health-color": color }}
      aria-label={aria}
      title={`${label} · ${erText}`}
      {...linkProps}
    >
      <div className="calendar-post-title">{p["Post Name"] || "—"}</div>
      <div className="calendar-post-meta">
        {platforms.length > 0 && (
          <span className="calendar-post-platforms">
            {platforms.map((pl, i) => (
              <span key={i} className="platform-badge" data-platform={pl.key} title={pl.label}>{pl.short}</span>
            ))}
          </span>
        )}
        <span className="calendar-post-health">
          <span className="health-dot" aria-hidden="true" />
          <span className="num">{erText}</span>
          <span className="calendar-post-health-label">{label}</span>
        </span>
      </div>
    </Tag>
  );
}

function AllPosts({ data }) {
  const [search, setSearch]     = useState("");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort]         = useState({ key: "Date", dir: "desc" });
  const [view, setView]         = useState("list");

  const toggleSort = (key) =>
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));

  const sortIcon = (key) =>
    sort.key !== key
      ? <span className="sort-icon is-idle" aria-hidden="true"><IconSort /></span>
      : <span className="sort-icon" aria-label={sort.dir === "desc" ? "sorted descending" : "sorted ascending"}>{sort.dir === "desc" ? <IconArrowDown /> : <IconArrowUp />}</span>;

  const posts = useMemo(() => {
    return (data.allPosts || [])
      .filter(p => {
        const matchPlatform = platform === "all" || (p.Platforms || "").toLowerCase().includes(platform);
        const query = search.toLowerCase().trim();
        const searchable = [p["Post Name"], p.Notes, p["Post Type"], p.Type].filter(Boolean).join(" ").toLowerCase();
        return matchPlatform && (!query || searchable.includes(query));
      })
      .sort((a, b) => {
        const dir = sort.dir === "desc" ? -1 : 1;
        if (sort.key === "Date") return dir * ((parsePostDate(a.Date)?.getTime() ?? 0) - (parsePostDate(b.Date)?.getTime() ?? 0));
        if (sort.key === "EngRate") {
          const erA = a.Impressions > 0 ? (a.Engagements / a.Impressions) * 100 : 0;
          const erB = b.Impressions > 0 ? (b.Engagements / b.Impressions) * 100 : 0;
          return dir * (erA - erB);
        }
        return dir * ((a[sort.key] || 0) - (b[sort.key] || 0));
      });
  }, [data.allPosts, search, platform, sort]);

  const calendarMonths = useMemo(() => {
    return posts.reduce((acc, p) => {
      const d = parsePostDate(p.Date);
      const key = d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : "unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});
  }, [posts]);

  // Oldest → newest, the way a quarter actually unfolds; undated posts last.
  const calendarKeys = Object.keys(calendarMonths).sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return a.localeCompare(b);
  });
  const thStyle = { cursor: "pointer", userSelect: "none" };

  return (
    <section id="all-posts" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">All <em>Posts</em></h2>
      </header>

      <div className="all-posts-controls">
        <div className="all-posts-controls-left">
          <input
            type="search"
            className="all-posts-input"
            placeholder="Search posts, notes, or post type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search posts"
          />
          <select
            className="all-posts-select"
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            aria-label="Filter by platform"
          >
            <option value="all">All platforms</option>
            <option value="linkedin">LinkedIn</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
          <span className="all-posts-count" aria-live="polite" aria-atomic="true">
            {posts.length} posts
          </span>
        </div>
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            className={"toggle-btn" + (view === "list" ? " is-active" : "")}
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
          >
            List
          </button>
          <button
            className={"toggle-btn" + (view === "calendar" ? " is-active" : "")}
            onClick={() => setView("calendar")}
            aria-pressed={view === "calendar"}
          >
            Calendar
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="all-posts-list-wrap">
          {posts.length === 0 && <EmptyData label="No posts match your search or filter." />}
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col" style={thStyle} onClick={() => toggleSort("Date")}>
                  Date{sortIcon("Date")}
                </th>
                <th scope="col">Platforms</th>
                <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("Impressions")}>
                  Impressions{sortIcon("Impressions")}
                </th>
                <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("Engagements")}>
                  Engagements{sortIcon("Engagements")}
                </th>
                <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("EngRate")}>
                  Eng. Rate{sortIcon("EngRate")}
                </th>
                <th scope="col" className="health-col">Health</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p, i) => {
                const d = parsePostDate(p.Date);
                const date = d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
                const { label, color, er, hasData } = healthForPost(p);
                return (
                  <tr key={(p["Post Name"] || "") + (p.Date || "") + i}>
                    <td>
                      <div className="campaign-name serif">
                        {p.URL
                          ? <a href={p.URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{p["Post Name"] || "—"}</a>
                          : (p["Post Name"] || "—")}
                      </div>
                      {p.Notes && <div className="campaign-chan">{p.Notes}</div>}
                    </td>
                    <td className="all-posts-cell-date">{date}</td>
                    <td className="all-posts-cell-platform">{p.Platforms || "—"}</td>
                    <td className="r num">{(p.Impressions || 0).toLocaleString()}</td>
                    <td className="r num">{(p.Engagements || 0).toLocaleString()}</td>
                    <td className="r num">{hasData ? er.toFixed(2) + "%" : "—"}</td>
                    <td className="health-col"><span className="health-label" style={{ color }}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="calendar-view">
          {calendarKeys.length === 0 && <EmptyData label="No posts match your search or filter." />}
          {calendarKeys.map(monthKey => {
            const monthPosts = calendarMonths[monthKey];
            if (monthKey === "unknown") {
              return (
                <div key="unknown" className="calendar-month">
                  <h3 className="calendar-month-title serif">Unknown date</h3>
                  <div className="calendar-grid-unknown">
                    {monthPosts.map((p, i) => <CalendarPost key={i} p={p} />)}
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
            monthPosts.forEach(p => {
              const d = parsePostDate(p.Date);
              if (d) {
                const day = d.getDate();
                if (!dayToPosts[day]) dayToPosts[day] = [];
                dayToPosts[day].push(p);
              }
            });
            return (
              <div key={monthKey} className="calendar-month">
                <h3 className="calendar-month-title serif">{label}</h3>
                <div className="calendar-weekdays" aria-hidden="true">
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="calendar-grid-month">
                  {Array.from({ length: totalCells }, (_, idx) => {
                    const dayNumber = idx - startOffset + 1;
                    const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
                    const postsForDay = inMonth ? (dayToPosts[dayNumber] || []) : [];
                    const shown = postsForDay.slice(0, CAL_MAX_PER_DAY);
                    const hidden = postsForDay.slice(CAL_MAX_PER_DAY);
                    return (
                      <div key={idx} className={"calendar-day-cell" + (inMonth ? "" : " is-pad") + (postsForDay.length ? " has-posts" : "")} aria-label={inMonth ? `${label} ${dayNumber}, ${postsForDay.length} post${postsForDay.length !== 1 ? "s" : ""}` : undefined}>
                        {inMonth && <div className="calendar-day-number serif" aria-hidden="true">{dayNumber}</div>}
                        <div className="calendar-day-posts">
                          {shown.map((p, i) => <CalendarPost key={i} p={p} />)}
                          {hidden.length > 0 && (
                            <details className="calendar-more">
                              <summary>+{hidden.length} more</summary>
                              <div className="calendar-day-posts">
                                {hidden.map((p, i) => <CalendarPost key={i} p={p} />)}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Notes ────────────────────────────────────────────────────────
function NoteList({ items }) {
  if (!items.length) return <EmptyNote />;
  const paras = items.flatMap(n => n.split(/\n+/).filter(s => s.trim()));
  return <ul>{paras.map((n, i) => <li key={i}>{n}</li>)}</ul>;
}

function Notes({ data }) {
  return (
    <section id="insights" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif"><em>Insights</em></h2>
      </header>
      <div className="notes">
        <div className="note working">    <h4>Working</h4>      <NoteList items={data.notes.working} /></div>
        <div className="note notworking"> <h4>Not working</h4>  <NoteList items={data.notes.notWorking} /></div>
        <div className="note">            <h4>Actions</h4>      <NoteList items={data.notes.actions} /></div>
        <div className="note">            <h4>Next quarter</h4> <NoteList items={data.notes.next} /></div>
      </div>
    </section>
  );
}

const SOCIAL_SECTIONS = [
  { id: "numbers",            label: "The Numbers" },
  { id: "quarter-by-quarter", label: "Quarterly" },
  { id: "week-by-week",       label: "Weekly" },
  { id: "platforms",          label: "Platforms" },
  { id: "top-posts",          label: "Top Posts" },
  { id: "all-posts",          label: "All Posts" },
  { id: "insights",           label: "Insights" },
];

// ─── Page ─────────────────────────────────────────────────────────
export function SocialPage({ agency, quarter, onReady }) {
  const [retryKey, setRetryKey] = useState(0);
  const { data, status, error } = useSocialReport(agency, quarter, retryKey);
  const history = useSocialKpiHistory(agency);

  useEffect(() => {
    if (status === "ready" || status === "error") onReady?.();
  }, [status, onReady]);

  if (status === "error") {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head"><h2 className="section-title serif">Unable to load <em>report</em></h2></header>
          <div className="error-section" role="alert">
            <p>{error}</p>
            <button className="error-retry-btn" onClick={() => setRetryKey(k => k + 1)}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

  if (status === "ready" && !data) {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head"><h2 className="section-title serif">Nothing here <em>yet</em></h2></header>
          <div className="error-section">
            <p>This report hasn’t been published for the selected quarter. Choose another quarter from the menu above, or check back soon.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!data) return <PageLoader view="social" />;

  return (
    <main className="report-wrap">
      <SectionRail sections={SOCIAL_SECTIONS} />
      <ErrorBoundary><Hero data={data} /></ErrorBoundary>
      <ErrorBoundary><Numbers data={data} /></ErrorBoundary>
      <ErrorBoundary><KpiHistory history={history} /></ErrorBoundary>
      <ErrorBoundary><Trend data={data} /></ErrorBoundary>
      <ErrorBoundary><Platforms data={data} /></ErrorBoundary>
      <ErrorBoundary><TopPosts data={data} /></ErrorBoundary>
      <ErrorBoundary><AllPosts data={data} /></ErrorBoundary>
      <ErrorBoundary><Notes data={data} /></ErrorBoundary>
    </main>
  );
}
