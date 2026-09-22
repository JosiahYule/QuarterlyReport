import React, { useEffect, useMemo, useState } from "react";
import { useWebReport } from "../hooks/useWebReport.js";
import { useFormStats } from "../hooks/useFormStats.js";
import { ContactFormsSection } from "../components/ContactFormsSection.jsx";
import { Delta } from "../components/Delta.jsx";
import { reportState } from "../components/ReportState.jsx";
import { usePublishedQuarters } from "../hooks/usePublishedQuarters.js";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { InsightsSection } from "../components/InsightsSection.jsx";
import { fmtInt, fmtPct, fmtTime, calcAutoDelta, parseDelta } from "../utils.js";
import { AGENCIES, QUARTERS } from "../config.js";
import { CountUp } from "../components/CountUp.jsx";
import { SectionRail } from "../components/SectionRail.jsx";

// ─── Hero ─────────────────────────────────────────────────────────
function Hero({ agency, quarter, data }) {
  const cfg = AGENCIES[agency] || AGENCIES.isl;
  const q = QUARTERS.find((q) => q.suffix === quarter) || QUARTERS[0];
  const note =
    typeof data.summary?.bullet === "string" && data.summary.bullet.trim()
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
  { key: "sessions", label: "Total Visits", fmt: fmtInt, note: "all sessions this quarter" },
  { key: "users", label: "Unique Users", fmt: fmtInt, note: "distinct visitors" },
  { key: "engagementRate", label: "Engagement Rate", fmt: fmtPct, note: "meaningful sessions" },
  {
    key: "avgEngagementTimeSec",
    label: "Avg Time on Site",
    fmt: fmtTime,
    note: "active engagement per visit",
  },
  { key: "actions", label: "Campaign Clicks", fmt: fmtInt, note: "high-intent interactions" },
  { key: "formSubmissions", label: "Form Submissions", fmt: fmtInt, note: "completed contact forms" },
];

function Numbers({ data, prevData }) {
  const o = data.overall || {};
  const prev = prevData?.overall || {};
  return (
    <section id="numbers" className="section wrap kpi-section" aria-label="Key performance indicators">
      <header className="section-head">
        <h2 className="section-title serif">
          The <em>Numbers</em>
        </h2>
      </header>
      <div className="kpi-grid">
        {KPI_DEFS.map((k, i) => {
          const v = o[k.key];
          const d = data.deltas?.[k.key] ? parseDelta(data.deltas[k.key]) : calcAutoDelta(v, prev[k.key]);
          return (
            <div className="kpi" key={k.key} style={{ "--i": i }}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value num">
                <CountUp value={v} format={k.fmt} />
              </div>
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
  (prevData?.channels || []).forEach((c) => {
    prevMap[c.name?.toLowerCase()] = c;
  });

  return (
    <section id="channels" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">
          Traffic <em>Channels</em>
        </h2>
      </header>
      <div className="channels" role="table" aria-label="Traffic channels breakdown">
        <div className="channel-row-web is-head" role="row">
          <div aria-hidden="true" />
          <div role="columnheader">Channel</div>
          <div className="col-num" role="columnheader">
            Sessions
          </div>
          <div className="col-num" role="columnheader">
            Share
          </div>
          <div className="col-num" role="columnheader">
            Eng. Rate
          </div>
        </div>
        {channels.map((c, i) => {
          const prev = prevMap[c.name?.toLowerCase()] || null;
          const sd = calcAutoDelta(c.sessions, prev?.sessions);
          const shd = calcAutoDelta(c.shareOfTraffic, prev?.shareOfTraffic);
          const ed = calcAutoDelta(c.engagementRate, prev?.engagementRate);
          return (
            <div className="channel-row-web" key={c.name} role="row">
              <div className="channel-idx serif ital" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div role="rowheader">
                <div className="channel-name serif">{c.name}</div>
              </div>
              <div className="col-num" role="cell" data-label="Sessions">
                <span className="big serif num">{fmtInt(c.sessions)}</span>
                {sd && (
                  <span className="sub">
                    <Delta d={sd} />
                  </span>
                )}
              </div>
              <div className="col-num" role="cell" data-label="Share">
                <span className="big serif num">{fmtPct(c.shareOfTraffic)}</span>
                {shd && (
                  <span className="sub">
                    <Delta d={shd} />
                  </span>
                )}
              </div>
              <div className="col-num" role="cell" data-label="Eng. Rate">
                <span className="big serif num">{fmtPct(c.engagementRate)}</span>
                {ed && (
                  <span className="sub">
                    <Delta d={ed} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Top pages ────────────────────────────────────────────────────
function TopPages({ data, prevData }) {
  const pages = data.topPages || [];
  const prevMap = {};
  (prevData?.topPages || []).forEach((p) => {
    prevMap[(p.key || p.name || "").toLowerCase()] = p;
  });

  return (
    <section id="top-pages" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">
          Top <em>Pages</em>
        </h2>
      </header>
      <div className="pages-grid">
        {pages.map((p) => {
          const prev = prevMap[(p.key || p.name || "").toLowerCase()] || null;
          const vd = calcAutoDelta(p.pageViews, prev?.pageViews);
          const bd = calcAutoDelta(p.bounceRate, prev?.bounceRate);
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
                {bd && <Delta d={bd} invertGood className="page-delta" />}
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

const WEB_SECTIONS = [
  { id: "numbers", label: "The Numbers" },
  { id: "channels", label: "Channels" },
  { id: "top-pages", label: "Top Pages" },
  { id: "contact-forms", label: "Contact Forms" },
  { id: "insights", label: "Insights" },
];

// ─── Page ─────────────────────────────────────────────────────────
export function WebPage({ agency, quarter, onReady }) {
  const [retryKey, setRetryKey] = useState(0);
  const { data, prevData, status, error } = useWebReport(agency, quarter, retryKey);
  const { stats: formStats, prevStats: prevFormStats } = useFormStats(agency, quarter);

  // Fresh array identity once the form stats land, so SectionRail re-checks
  // the DOM and picks up the (conditionally rendered) Contact Forms section.
  const railSections = useMemo(
    () => WEB_SECTIONS.filter((s) => s.id !== "contact-forms" || formStats?.totals?.total > 0),
    [formStats]
  );

  useEffect(() => {
    if (status === "ready" || status === "error") onReady?.();
  }, [status, onReady]);

  const published = usePublishedQuarters("web", agency);
  const gate = reportState({
    status,
    error,
    data,
    view: "web",
    onRetry: () => setRetryKey((k) => k + 1),
    quarter,
    agency,
    published,
  });
  if (gate) return gate;

  return (
    <main className="report-wrap">
      <SectionRail sections={railSections} />
      <ErrorBoundary>
        <Hero agency={agency} quarter={quarter} data={data} />
      </ErrorBoundary>
      <ErrorBoundary>
        <Numbers data={data} prevData={prevData} />
      </ErrorBoundary>
      <ErrorBoundary>
        <Channels data={data} prevData={prevData} />
      </ErrorBoundary>
      <ErrorBoundary>
        <TopPages data={data} prevData={prevData} />
      </ErrorBoundary>
      <ErrorBoundary>
        <ContactFormsSection stats={formStats} prevStats={prevFormStats} quarter={quarter} />
      </ErrorBoundary>
      <ErrorBoundary>
        <InsightsSection insights={data.insights} />
      </ErrorBoundary>
    </main>
  );
}
