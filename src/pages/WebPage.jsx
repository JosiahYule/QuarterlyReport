import React, { useEffect } from "react";
import { useWebReport } from "../hooks/useWebReport.js";
import { Delta } from "../components/Delta.jsx";
import { PageLoader } from "../components/PageLoader.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { EmptyNote } from "../components/EmptyState.jsx";
import { fmtInt, fmtPct, fmtTime, calcAutoDelta, parseDelta, FLAT } from "../utils.js";
import { AGENCIES, QUARTERS } from "../config.js";

// ─── Hero ─────────────────────────────────────────────────────────
function Hero({ agency, quarter, data }) {
  const cfg = AGENCIES[agency] || AGENCIES.isl;
  const q   = QUARTERS.find(q => q.suffix === quarter) || QUARTERS[0];
  const note = typeof data.summary?.bullet === "string" && data.summary.bullet.trim()
    ? data.summary.bullet.trim()
    : `Website performance report for ${cfg.name}.`;

  return (
    <section className="hero wrap">
      <div className="hero-b-top">
        <div className="hero-b-left">
          <div className="hero-b-q serif">{q.label}</div>
          <div className="hero-b-divider" />
          <div className="hero-b-meta">
            <div className="hero-b-meta-name">{cfg.name}</div>
            <div className="hero-b-meta-range">{q.rangeLabel}</div>
          </div>
        </div>
        <div className="hero-b-type">Website</div>
      </div>
      {note && <p className="hero-b-note">{note}</p>}
    </section>
  );
}

// ─── KPI grid ─────────────────────────────────────────────────────
const KPI_DEFS = [
  { key: "sessions",             label: "Total Visits",      fmt: fmtInt,  note: "all sessions this quarter" },
  { key: "users",                label: "Unique Users",      fmt: fmtInt,  note: "distinct visitors" },
  { key: "engagementRate",       label: "Engagement Rate",   fmt: fmtPct,  note: "meaningful sessions" },
  { key: "avgEngagementTimeSec", label: "Avg Time on Site",  fmt: fmtTime, note: "active engagement per visit" },
  { key: "actions",              label: "Candidate Actions", fmt: fmtInt,  note: "high-intent interactions" },
  { key: "formSubmissions",      label: "Form Submissions",  fmt: fmtInt,  note: "completed contact forms" },
];

function Numbers({ data, prevData }) {
  const o = data.overall || {};
  const prev = prevData?.overall || {};
  return (
    <section className="section wrap kpi-section" aria-label="Key performance indicators">
      <header className="section-head">
        <h2 className="section-title serif">The Numbers</h2>
      </header>
      <div className="kpi-grid">
        {KPI_DEFS.map(k => {
          const v = o[k.key];
          const d = data.deltas?.[k.key]
            ? parseDelta(data.deltas[k.key])
            : calcAutoDelta(v, prev[k.key]) || FLAT;
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

// ─── Traffic channels ─────────────────────────────────────────────
function Channels({ data, prevData }) {
  const channels = data.channels || [];
  const prevMap = {};
  (prevData?.channels || []).forEach(c => { prevMap[c.name?.toLowerCase()] = c; });

  return (
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Traffic Channels</h2>
      </header>
      <div className="channels" role="grid" aria-label="Traffic channels breakdown">
        <div className="channel-row-web is-head" role="row">
          <div role="columnheader" />
          <div role="columnheader">Channel</div>
          <div className="col-num" role="columnheader">Sessions</div>
          <div className="col-num" role="columnheader">Share</div>
          <div className="col-num" role="columnheader">Eng. Rate</div>
        </div>
        {channels.map((c, i) => {
          const prev = prevMap[c.name?.toLowerCase()] || null;
          const sd  = calcAutoDelta(c.sessions, prev?.sessions);
          const shd = calcAutoDelta(c.shareOfTraffic, prev?.shareOfTraffic);
          const ed  = calcAutoDelta(c.engagementRate, prev?.engagementRate);
          return (
            <div className="channel-row-web" key={c.name} role="row">
              <div className="channel-idx serif ital" aria-hidden="true">{String(i + 1).padStart(2, "0")}</div>
              <div><div className="channel-name serif">{c.name}</div></div>
              <div className="col-num">
                <span className="big serif num">{fmtInt(c.sessions)}</span>
                {sd && <span className="sub"><Delta d={sd} /></span>}
              </div>
              <div className="col-num">
                <span className="big serif num">{fmtPct(c.shareOfTraffic)}</span>
                {shd && <span className="sub"><Delta d={shd} /></span>}
              </div>
              <div className="col-num">
                <span className="big serif num">{fmtPct(c.engagementRate)}</span>
                {ed && <span className="sub"><Delta d={ed} /></span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Top pages ────────────────────────────────────────────────────
function invertDir(d) {
  if (!d) return null;
  return { ...d, dir: d.dir === "up" ? "down" : d.dir === "down" ? "up" : "flat" };
}

function TopPages({ data, prevData }) {
  const pages = data.topPages || [];
  const prevMap = {};
  (prevData?.topPages || []).forEach(p => { prevMap[(p.key || p.name || "").toLowerCase()] = p; });

  return (
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Top Pages</h2>
      </header>
      <div className="pages-grid">
        {pages.map(p => {
          const prev = prevMap[(p.key || p.name || "").toLowerCase()] || null;
          const vd = calcAutoDelta(p.pageViews, prev?.pageViews);
          const bd = invertDir(calcAutoDelta(p.bounceRate, prev?.bounceRate));
          const td = calcAutoDelta(p.avgTimeOnPageSec, prev?.avgTimeOnPageSec);
          return (
            <div className="page-tile" key={p.key}>
              <div className="page-tile-name serif">{p.key}</div>
              <div className="page-stat">
                <div className="page-stat-label">Page Views</div>
                <div className="page-stat-value serif">{fmtInt(p.pageViews)}</div>
                {vd && <Delta d={vd} className="page-delta" />}
              </div>
              <div className="page-stat">
                <div className="page-stat-label">Bounce Rate</div>
                <div className="page-stat-value serif">{fmtPct(p.bounceRate)}</div>
                {bd && <Delta d={bd} className="page-delta" />}
              </div>
              <div className="page-stat">
                <div className="page-stat-label">Avg Time</div>
                <div className="page-stat-value serif">{fmtTime(p.avgTimeOnPageSec)}</div>
                {td && <Delta d={td} className="page-delta" />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Notes ────────────────────────────────────────────────────────
const toList = v =>
  Array.isArray(v) ? v
  : typeof v === "string" && v.trim() ? v.split("\n\n").filter(Boolean)
  : [];

function Notes({ data }) {
  const ins = data.insights || {};
  const sections = [
    { key: "working",    label: "Working",      cls: "working" },
    { key: "notWorking", label: "Not working",  cls: "notworking" },
    { key: "actions",    label: "Actions",      cls: "" },
    { key: "next",       label: "Next quarter", cls: "" },
  ];
  return (
    <section className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Editor's Notes</h2>
      </header>
      <div className="notes">
        {sections.map(s => {
          const items = toList(ins[s.key]);
          return (
            <div className={"note " + s.cls} key={s.key}>
              <h4>{s.label}</h4>
              {items.length
                ? <div>{items.map((n, i) => <p key={i}>{n}</p>)}</div>
                : <EmptyNote />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export function WebPage({ agency, quarter, onReady }) {
  const { data, prevData, status, error } = useWebReport(quarter);

  useEffect(() => {
    if (status === "ready" || status === "error") onReady?.();
  }, [status, onReady]);

  if (status === "error") {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head"><h2 className="section-title serif">Unable to load report</h2></header>
          <div className="error-section" role="alert">
            <p>{error}</p>
            <button className="error-retry-btn" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

  if (!data) return <PageLoader view="web" />;

  return (
    <main className="report-wrap">
      <ErrorBoundary><Hero agency={agency} quarter={quarter} data={data} /></ErrorBoundary>
      <ErrorBoundary><Numbers data={data} prevData={prevData} /></ErrorBoundary>
      <ErrorBoundary><Channels data={data} prevData={prevData} /></ErrorBoundary>
      <ErrorBoundary><TopPages data={data} prevData={prevData} /></ErrorBoundary>
      <ErrorBoundary><Notes data={data} /></ErrorBoundary>
    </main>
  );
}
