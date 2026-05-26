import React, { useState, useMemo, useEffect } from "react";
import { useSocialReport } from "../hooks/useSocialReport.js";
import { Delta } from "../components/Delta.jsx";
import { PageLoader } from "../components/PageLoader.jsx";
import { fmt, fmtExact } from "../utils.js";

const FLAT = { dir: "flat", pct: 0 };

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
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">The Numbers</h2>
      </header>
      <div className="kpi-grid">
        {KPI_DEFS.map(k => {
          const v = data.overall[k.key];
          const d = data.deltas?.[k.key] || FLAT;
          return (
            <div className="kpi" key={k.key}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value num">{k.fmt(v)}</div>
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
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Week by Week</h2>
      </header>
      <div className="trend-body">
        <TrendChart data={data} metric={metric} />
        <div className="trend-legend">
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
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">By Platform</h2>
      </header>
      <div className="channels">
        <div className="channel-row is-head">
          <div />
          <div>Platform</div>
          <div className="col-num">Followers</div>
          <div className="col-num">Engagement Rate</div>
          <div className="col-num">Page Reach</div>
          <div className="col-num">Page Clicks</div>
        </div>
        {data.platforms.map((p, i) => (
          <div className="channel-row" key={p.key}>
            <div className="channel-idx serif ital">{String(i + 1).padStart(2, "0")}.</div>
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
function TopPosts({ data }) {
  const [platform, setPlatform] = useState("linkedin");
  const posts = data.topPostsByPlatform[platform] || [];
  const PLATFORMS = [
    { key: "linkedin",  label: "LinkedIn" },
    { key: "facebook",  label: "Facebook" },
    { key: "instagram", label: "Instagram" },
  ];

  return (
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Top Posts</h2>
      </header>
      <div className="platform-tabs">
        {PLATFORMS.map(pt => (
          <button
            key={pt.key}
            className={"platform-tab serif" + (platform === pt.key ? " is-active" : "")}
            onClick={() => setPlatform(pt.key)}
          >
            {pt.label}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Post</th>
              <th scope="col" className="r">Impressions</th>
              <th scope="col" className="r">Reactions</th>
              <th scope="col" className="r">Shares</th>
              <th scope="col" className="r">Engagement</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((c, i) => {
              const engagement = c.impressions > 0 ? (c.likes + c.shares) / c.impressions * 100 : 0;
              return (
                <tr key={c.title + i}>
                  <td>
                    <span className="campaign-name serif">{c.title}</span>
                    <div className="campaign-chan">{platform}</div>
                  </td>
                  <td className="r num">{fmtExact(c.impressions)}</td>
                  <td className="r num">{c.likes}</td>
                  <td className="r num">{c.shares}</td>
                  <td className="r num" style={{ color: engagement >= 5 ? "var(--up)" : "var(--ink)" }}>
                    {engagement.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── All Posts ────────────────────────────────────────────────────
function healthForER(er) {
  const label = er > 10 ? "Very Strong" : er >= 6 ? "Strong" : er >= 4 ? "Moderate" : "Low";
  const color = er > 10 ? "var(--accent)" : er >= 6 ? "var(--up)" : er >= 4 ? "#b87000" : "var(--down)";
  return { label, color };
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
      ? <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>
      : <span style={{ marginLeft: 4 }}>{sort.dir === "desc" ? "↓" : "↑"}</span>;

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
        if (sort.key === "Date") return dir * (new Date(a.Date) - new Date(b.Date));
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
      const d = p.Date ? new Date(p.Date) : null;
      const key = d && !Number.isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : "unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});
  }, [posts]);

  const calendarKeys = Object.keys(calendarMonths).sort((a, b) => b.localeCompare(a));
  const thStyle = { cursor: "pointer", userSelect: "none" };

  return (
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">All Posts</h2>
      </header>

      <div className="all-posts-controls">
        <div className="all-posts-controls-left">
          <input
            type="search"
            className="all-posts-input"
            placeholder="Search posts, notes, or post type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="all-posts-select" value={platform} onChange={e => setPlatform(e.target.value)}>
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

      {view === "list" ? (
        <div className="all-posts-list-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col" style={thStyle} onClick={() => toggleSort("Date")}>Date{sortIcon("Date")}</th>
                <th scope="col">Platforms</th>
                <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("Impressions")}>Impressions{sortIcon("Impressions")}</th>
                <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("Engagements")}>Engagements{sortIcon("Engagements")}</th>
                <th scope="col" className="r" style={thStyle} onClick={() => toggleSort("EngRate")}>Eng. Rate{sortIcon("EngRate")}</th>
                <th scope="col" className="health-col">Health</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p, i) => {
                const date = p.Date ? new Date(p.Date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
                const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
                const { label, color } = healthForER(er);
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
                    <td className="r num">{er.toFixed(2)}%</td>
                    <td className="health-col"><span className="health-label" style={{ color }}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="calendar-view">
          {calendarKeys.map(monthKey => {
            const monthPosts = calendarMonths[monthKey];
            if (monthKey === "unknown") {
              return (
                <div key="unknown" className="calendar-month">
                  <h3 className="calendar-month-title serif">Unknown date</h3>
                  <div className="calendar-grid-unknown">
                    {monthPosts.map((p, i) => {
                      const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
                      const { color } = healthForER(er);
                      return (
                        <article key={i} className="calendar-post" style={{ "--health-color": color }}>
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
            monthPosts.forEach(p => {
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
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="calendar-grid-month">
                  {Array.from({ length: totalCells }, (_, idx) => {
                    const dayNumber = idx - startOffset + 1;
                    const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
                    const postsForDay = inMonth ? (dayToPosts[dayNumber] || []) : [];
                    return (
                      <div key={idx} className={"calendar-day-cell" + (inMonth ? "" : " is-pad")}>
                        {inMonth && <div className="calendar-day-number serif">{dayNumber}</div>}
                        <div className="calendar-day-posts">
                          {postsForDay.map((p, i) => {
                            const er = p.Impressions > 0 ? (p.Engagements / p.Impressions) * 100 : 0;
                            const { color, label } = healthForER(er);
                            return (
                              <article key={i} className="calendar-post" style={{ "--health-color": color }} title={`${label} · ER ${er.toFixed(2)}%`}>
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
        </div>
      )}
    </section>
  );
}

// ─── Notes ────────────────────────────────────────────────────────
function NoteList({ items }) {
  if (!items.length) return <p className="note-empty">No notes yet.</p>;
  return <ul>{items.map((n, i) => <li key={i}>{n}</li>)}</ul>;
}

function Notes({ data }) {
  return (
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Insights</h2>
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

// ─── Page ─────────────────────────────────────────────────────────
export function SocialPage({ agency, quarter, onReady }) {
  const { data, status, error } = useSocialReport(agency, quarter);

  useEffect(() => {
    if (status === "ready" || status === "error") onReady?.();
  }, [status, onReady]);

  if (status === "error") {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head"><h2 className="section-title serif">Unable to load report</h2></header>
          <div className="error-section">
            <p>{error}</p>
            <button className="error-retry-btn" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

  if (!data) return <PageLoader />;

  return (
    <main className="report-wrap">
      <Hero data={data} />
      <Numbers data={data} />
      <Trend data={data} />
      <Platforms data={data} />
      <TopPosts data={data} />
      <AllPosts data={data} />
      <Notes data={data} />
    </main>
  );
}
