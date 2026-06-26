import React, { useEffect, useRef, useMemo, useState } from "react";
import Chart from "chart.js/auto";
import { useTrendsData, METRICS, extractMetric, computeAdvancedPace, getMetricHistory, quarterCompletion, quarterComplete, buildProjectionAudits, blendCalibrationHistory, getWeekAgoProjection, getProjectionTimeline } from "../hooks/useTrendsData.js";
import { TRENDS_QUARTERS, AGENCIES } from "../config.js";
import { fmt, fmtApprox } from "../utils.js";
import { PageLoader } from "../components/PageLoader.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { SectionRail } from "../components/SectionRail.jsx";

// Chart colours — q2/q3 follow the agency accent; proj stays visually
// distinct from q3 for every palette.
const CHART_PALETTES = {
  isl: { q1: "rgba(100,116,139,.7)", q2: "rgba(0,61,114,.8)",  q3: "rgba(0,84,154,.85)",   proj: "rgba(180,130,0,.85)" },
  as:  { q1: "rgba(100,116,139,.7)", q2: "rgba(92,69,0,.8)",   q3: "rgba(122,92,0,.85)",   proj: "rgba(10,77,140,.85)" },
  ads: { q1: "rgba(100,116,139,.7)", q2: "rgba(10,67,89,.8)",  q3: "rgba(15,91,120,.85)",  proj: "rgba(180,130,0,.85)" },
};
const paletteFor = (agency) => CHART_PALETTES[agency] || CHART_PALETTES.isl;

// ─── Custom tooltip handler (editorial style) ──────────────────────
function makeTooltipHandler(isPercent) {
  return function externalTooltip({ chart, tooltip }) {
    let el = chart.canvas.parentNode.querySelector(".chart-tooltip-custom");
    if (!el) {
      el = document.createElement("div");
      el.className = "chart-tooltip-custom";
      chart.canvas.parentNode.appendChild(el);
    }

    if (tooltip.opacity === 0) {
      el.style.opacity = "0";
      return;
    }

    const title = tooltip.title?.[0] ?? "";
    const rawVal = tooltip.dataPoints?.[0]?.parsed?.y ?? null;
    const body = rawVal !== null ? fmtApprox(rawVal, isPercent) : "";
    const isProj = title.includes("Projected");

    el.innerHTML =
      `<div class="ctt-title">${title}</div>` +
      `<div class="ctt-body">${body}${isProj ? '<span class="ctt-tag">projected</span>' : ""}</div>`;

    const x = tooltip.caretX;
    const y = tooltip.caretY;

    el.style.opacity = "1";
    el.style.top = y + "px";

    // Clamp horizontally so the tooltip doesn't overflow the chart container.
    const containerWidth = chart.canvas.parentNode.offsetWidth;
    const tooltipWidth = el.offsetWidth || 120;
    el.style.left = Math.min(x, containerWidth - tooltipWidth - 8) + "px";
  };
}

// ─── Chart card ───────────────────────────────────────────────────
function ChartCard({ metric, agency, qdata, snaps, calibrationFactor = 1 }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const C = paletteFor(agency);
  const [d1, d2, d3] = qdata;
  const [tq1, tq2, tq3] = TRENDS_QUARTERS;
  const q3 = tq3;
  const done = quarterComplete(q3);
  const rangeShort = q => q.rangeLabel.split(" ")[0];

  const q1v = extractMetric(d1, metric);
  const q2v = extractMetric(d2, metric);
  const q3v = extractMetric(d3, metric);

  const q2Rate = q2v !== null
    ? (metric.baselineFromQ2 && q1v !== null ? (q2v - q1v) : q2v) / ((tq2.end - tq2.start) / 86400000)
    : null;

  const q3input = metric.baselineFromQ2 && q2v !== null && q3v !== null ? q3v - q2v : q3v;
  const histBaseline = metric.baselineFromQ2 && q2v !== null ? q2v : 0;

  let pace = metric.isPace && !done
    ? computeAdvancedPace(q3input, q3.start, q3.end, q2Rate, getMetricHistory(snaps, metric.id), histBaseline, new Date(), calibrationFactor)
    : null;

  const projected = pace?.projected ?? null;
  const chartQ3val = projected !== null
    ? (metric.baselineFromQ2 && q2v !== null ? q2v + projected : projected)
    : (q3v ?? 0);

  const isProjected = projected !== null;
  const labels = [
    `${tq1.label} · ${rangeShort(tq1)}`,
    `${tq2.label} · ${rangeShort(tq2)}`,
    isProjected ? `${tq3.label} · Projected` : `${tq3.label} · ${rangeShort(tq3)}`,
  ];
  const colors = [C.q1, C.q2, isProjected ? C.proj : C.q3];
  const values = [q1v ?? 0, q2v ?? 0, chartQ3val];

  const sub = done
    ? "Quarter-over-quarter actuals"
    : `${tq1.label} & ${tq2.label} actuals · ${tq3.label} pace projection`;

  // Create the chart instance once per agency change; options (scales, tooltip) are stable.
  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: 2,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: makeTooltipHandler(metric.isPercent),
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11, family: "Inter Tight, system-ui" }, color: "#64748b" },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,.04)" },
            border: { display: false, dash: [3, 3] },
            ticks: {
              font: { size: 11, family: "Inter Tight, system-ui" }, color: "#64748b", padding: 6,
              callback: v => metric.isPercent ? `${v.toFixed(1)}%` : v >= 1000 ? v.toLocaleString() : v,
            },
          },
        },
      },
    });

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [agency]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update data in-place when values change — avoids destroy/recreate on every data refresh.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
    // labels[2] changes when projected status flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values[0], values[1], values[2], labels[2]]);

  const legendItems = [
    { color: C.q1, label: `${tq1.label} Actual` },
    { color: C.q2, label: `${tq2.label} Actual` },
    isProjected
      ? { color: C.proj, label: `${tq3.label} Projected` }
      : { color: C.q3,   label: `${tq3.label} ${done ? "Actual" : "To Date"}` },
  ];

  return (
    <div className="chart-card">
      <div className="chart-card-title serif">{metric.label}</div>
      <div className="chart-card-sub">{sub}</div>
      <div className="chart-wrap">
        <canvas ref={canvasRef} />
      </div>
      <div className="chart-legend" aria-hidden="true">
        {legendItems.map(item => (
          <div key={item.label} className="legend-item">
            <div className="legend-dot" style={{ background: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Projection trajectory chart (how the projected final has moved) ──
function ProjTrajectoryChart({ timeline, metric }) {
  const W = 880, H = 260, pL = 68, pR = 64, pT = 28, pB = 48;
  if (!timeline || timeline.length < 2) {
    return (
      <div className="kpi-history-empty">
        Projections begin after the first week of the quarter, once a few daily snapshots have accrued.
      </div>
    );
  }

  const vals = timeline.map(p => p.projected);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const span = maxV - minV;
  const pad  = span > 0 ? span * 0.15 : (maxV || 1) * 0.05;
  const domMin = Math.max(0, minV - pad);
  const domMax = maxV + pad;
  const domRange = domMax - domMin || 1;

  const minT = timeline[0].t, maxT = timeline[timeline.length - 1].t;
  const tRange = maxT - minT || 1;
  const X = t => pL + ((t - minT) / tRange) * (W - pL - pR);
  const Y = v => pT + (H - pT - pB) * (1 - (v - domMin) / domRange);

  const pts = timeline.map(p => ({ x: X(p.t), y: Y(p.projected), v: p.projected }));
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const areaPath = linePath
    + ` L${pts[pts.length - 1].x.toFixed(1)},${(H - pB).toFixed(1)}`
    + ` L${pts[0].x.toFixed(1)},${(H - pB).toFixed(1)} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: domMin + domRange * f, y: pT + (H - pT - pB) * (1 - f) }));
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const nLabels = Math.min(4, timeline.length);
  const xLabels = Array.from({ length: nLabels }, (_, i) => {
    const t = minT + tRange * (i / (nLabels - 1));
    return { x: X(t), label: fmtDate(t) };
  });
  const last = pts[pts.length - 1];

  return (
    <svg className="kpi-history-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
         role="img" aria-label={`${metric.label} — projected final over the quarter so far`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pL} x2={W - pR} y1={t.y} y2={t.y} stroke="var(--rule-soft)" strokeWidth="1" />
          <text x={pL - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--ink-4)" fontFamily="var(--sans)">
            {fmt(t.v)}
          </text>
        </g>
      ))}
      <line x1={pL} x2={W - pR} y1={H - pB} y2={H - pB} stroke="var(--ink)" strokeWidth="1" />
      <path d={areaPath} fill="var(--accent)" opacity="0.06" />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 2.5}
                fill="var(--paper)" stroke="var(--accent)" strokeWidth="2" />
      ))}
      <text x={last.x} y={last.y - 14} textAnchor="end" fontFamily="var(--serif)" fontStyle="italic" fontSize="13" fill="var(--accent)">
        latest — {fmtApprox(last.v, metric.isPercent)}
      </text>
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - pB + 20} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--sans)">
          {l.label}
        </text>
      ))}
    </svg>
  );
}

// ─── Projection trajectory section (click through metrics) ────────────
function ProjectionTrajectory({ qdata, snaps, calibrationFactors }) {
  const [d1, d2] = qdata;
  const [, tq2, tq3] = TRENDS_QUARTERS;
  const [activeKey, setActiveKey] = useState(METRICS[0].id);

  const metric = METRICS.find(m => m.id === activeKey) || METRICS[0];

  const timeline = useMemo(() => {
    const q1v = extractMetric(d1, metric);
    const q2v = extractMetric(d2, metric);
    const histBaseline = metric.baselineFromQ2 && q2v !== null ? q2v : 0;
    const q2Rate = q2v !== null
      ? (metric.baselineFromQ2 && q1v !== null ? (q2v - q1v) : q2v) / ((tq2.end - tq2.start) / 86400000)
      : null;
    const calibrationFactor = calibrationFactors[metric.id] ?? 1;
    return getProjectionTimeline(snaps, metric, tq3, q2Rate, histBaseline, calibrationFactor);
  }, [d1, d2, metric, tq2, tq3, snaps, calibrationFactors]);

  // Show the section once any metric has enough snapshot history to plot.
  const hasData = METRICS.some(m => getMetricHistory(snaps, m.id).length >= 2);
  if (!hasData) return null;

  return (
    <section id="projection-trajectory" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">Projection <em>Trajectory</em></h2>
        <p className="section-sub">How each metric’s projected {tq3.label} final has shifted as the quarter has accrued daily snapshots.</p>
      </header>
      <div className="kpi-history-body">
        <nav className="kpi-history-nav" aria-label="Select metric">
          {METRICS.map(m => (
            <button
              key={m.id}
              className={"kpi-history-nav-item" + (activeKey === m.id ? " is-active" : "")}
              onClick={() => setActiveKey(m.id)}
              aria-pressed={activeKey === m.id}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <div className="kpi-history-chart-wrap">
          <ProjTrajectoryChart timeline={timeline} metric={metric} />
        </div>
      </div>
    </section>
  );
}

// ─── Projection card ──────────────────────────────────────────────
function ProjCard({ metric, qdata, snaps, q3done, calibrationFactor = 1, history }) {
  const [d1, d2, d3] = qdata;
  const [, tq2, tq3] = TRENDS_QUARTERS;

  const q1v = extractMetric(d1, metric);
  const q2v = extractMetric(d2, metric);
  const q3v = extractMetric(d3, metric);
  const histBaseline = metric.baselineFromQ2 && q2v !== null ? q2v : 0;
  const q3input = metric.baselineFromQ2 && q2v !== null && q3v !== null ? q3v - q2v : q3v;

  const q2Rate = q2v !== null
    ? (metric.baselineFromQ2 && q1v !== null ? (q2v - q1v) : q2v) / ((tq2.end - tq2.start) / 86400000)
    : null;

  let pace = metric.isPace && !q3done
    ? computeAdvancedPace(q3input, tq3.start, tq3.end, q2Rate, getMetricHistory(snaps, metric.id), histBaseline, new Date(), calibrationFactor)
    : null;

  const projected = pace?.projected ?? null;
  const rateVsQ2  = pace && q2Rate ? ((pace.dailyRate - q2Rate) / q2Rate * 100) : null;
  const headlineVal = projected !== null ? projected : q3v;
  const headline  = headlineVal !== null ? fmtApprox(headlineVal, metric.isPercent) : "—";
  const ql = tq3.label;
  const headlineSub = projected !== null
    ? (q3done ? `${ql} Final` : `Projected Final · ${ql}`)
    : (metric.baselineFromQ2 ? `${ql} Current Total` : `${ql} Current`);

  const stat1Label = metric.baselineFromQ2 ? `${ql} Net New` : `${ql} to Date`;
  const stat1Val   = metric.baselineFromQ2 && q3v !== null && q2v !== null ? fmt(q3v - q2v, metric.isPercent) : fmt(q3v, metric.isPercent);

  const stat2Val = pace
    ? (metric.isPercent ? `${pace.dailyRate.toFixed(3)}%/day` : `${pace.dailyRate.toFixed(1)}/day`)
    : "—";

  let stat3Val = "—", stat3Cls = "na";
  if (rateVsQ2 !== null) {
    stat3Val = `${rateVsQ2 >= 0 ? "+" : "−"}${Math.abs(rateVsQ2).toFixed(1)}%`;
    stat3Cls = rateVsQ2 >= 0 ? "pos" : "neg";
  } else if (!metric.isPace) {
    stat3Val = "n/a";
  }

  // Week-over-week projection change
  const weekAgoProj = projected !== null && !q3done
    ? getWeekAgoProjection(snaps, metric, tq3, q2Rate, histBaseline)
    : null;
  let wowVal = "—", wowCls = "na";
  if (weekAgoProj !== null && projected !== null) {
    const delta = projected - weekAgoProj;
    wowVal = `${delta >= 0 ? "+" : "−"}${fmtApprox(Math.abs(delta), metric.isPercent)}`;
    wowCls = delta >= 0 ? "pos" : "neg";
  }

  // Track record: average absolute miss across persisted past-quarter audits
  // for this metric, so the calibration correction isn't an invisible
  // multiplier — you can see how accurate it's actually been.
  const errors = (history ?? []).map(h => h.percent_error).filter(Number.isFinite);
  const trackRecordVal = errors.length
    ? `±${(errors.reduce((a, e) => a + Math.abs(e), 0) / errors.length).toFixed(1)}% · ${errors.length}Q`
    : "—";

  return (
    <div className="proj-card">
      <div className="proj-card-label">{metric.label}</div>
      <div className="proj-number serif">{headline}</div>
      <div className="proj-number-sub">{headlineSub}</div>
      <div className="proj-stats-grid">
        <div className="proj-stat">
          <div className="proj-stat-label">{stat1Label}</div>
          <div className="proj-stat-value">{stat1Val}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">Daily Rate</div>
          <div className="proj-stat-value rate">{stat2Val}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">Rate vs {tq2.label}</div>
          <div className={"proj-stat-value " + stat3Cls}>{stat3Val}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">vs Last Week</div>
          <div className={"proj-stat-value " + wowCls}>{wowVal}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">Past Accuracy</div>
          <div className="proj-stat-value">{trackRecordVal}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────
function Hero({ agency, q3comp, q3done }) {
  const cfg = AGENCIES[agency] || AGENCIES.isl;
  const pct = (q3comp * 100).toFixed(1);
  return (
    <section className="hero wrap">
      <div className="hero-b-top">
        <div className="hero-b-left">
          <div className="hero-b-q serif">Trends</div>
          <div className="hero-b-divider" />
          <div className="hero-b-meta">
            <div className="hero-b-meta-name">{cfg.name}</div>
            <div className="hero-b-meta-range">{TRENDS_QUARTERS.map(q => q.label).join(" · ")} · {TRENDS_QUARTERS[2].year}</div>
          </div>
        </div>
        <div className="hero-b-type trends-progress">
          <span className="trends-pct-label">{pct}% elapsed{q3done ? " · complete" : ""}</span>
          <span className="hero-progress-track" role="progressbar" aria-valuenow={Math.round(q3comp * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Quarter ${Math.round(q3comp * 100)}% elapsed`}>
            <span className="hero-progress-fill" style={{ width: `${Math.min(100, q3comp * 100).toFixed(1)}%` }} />
          </span>
        </div>
      </div>
    </section>
  );
}

const TRENDS_SECTIONS = [
  { id: "projections",           label: "Projections" },
  { id: "projection-trajectory", label: "Trajectory" },
  { id: "quarterly-trends",      label: "Trends" },
];

// ─── Page ─────────────────────────────────────────────────────────
export function TrendsPage({ agency, onReady }) {
  const { qdata, snapsByQuarter, calibrationHistory, status, error } = useTrendsData(agency);

  useEffect(() => {
    if (status === "ready" || status === "error") onReady?.();
  }, [status, onReady]);

  const projectionAudits = useMemo(
    () => qdata ? buildProjectionAudits(qdata, snapsByQuarter) : {},
    [qdata, snapsByQuarter]
  );

  // Multi-quarter calibration: prefer the persisted, recency-weighted blend
  // across past quarters' audits; fall back to this session's live
  // one-quarter-back audit when no history has been persisted yet (new
  // agency, or before this quarter's first run has had a chance to write it).
  const calibrationFactors = useMemo(() => Object.fromEntries(
    METRICS.map(m => {
      const blended = blendCalibrationHistory(calibrationHistory?.[m.id]);
      const factor = blended ?? projectionAudits[m.id]?.calibrationFactor ?? 1;
      return [m.id, factor];
    })
  ), [calibrationHistory, projectionAudits]);

  if (status === "error") {
    return (
      <main className="report-wrap">
        <section className="section wrap">
          <header className="section-head"><h2 className="section-title serif">Unable to load trends</h2></header>
          <div className="error-section" role="alert">
            <p>{error}</p>
            <button className="error-retry-btn" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </section>
      </main>
    );
  }

  if (!qdata) return <PageLoader view="trends" />;

  const q3     = TRENDS_QUARTERS[2];
  const q3comp = quarterCompletion(q3);
  const q3done = quarterComplete(q3);

  return (
    <main className="report-wrap">
      <SectionRail sections={TRENDS_SECTIONS} />
      <ErrorBoundary><Hero agency={agency} q3comp={q3comp} q3done={q3done} /></ErrorBoundary>

      <ErrorBoundary>
        <section id="projections" className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">{TRENDS_QUARTERS[2].label} Projected <em>Finals</em></h2>
            <p className="section-sub">Estimated end-of-quarter totals based on observed daily rate × total quarter days.</p>
          </header>
          <div className="proj-grid">
            {METRICS.map(m => (
              <ProjCard key={m.id} metric={m} qdata={qdata} snaps={snapsByQuarter[TRENDS_QUARTERS[2].suffix] ?? []} q3done={q3done} calibrationFactor={calibrationFactors[m.id]} history={calibrationHistory?.[m.id]} />
            ))}
          </div>
        </section>
      </ErrorBoundary>

      <ErrorBoundary>
        <ProjectionTrajectory qdata={qdata} snaps={snapsByQuarter[TRENDS_QUARTERS[2].suffix] ?? []} calibrationFactors={calibrationFactors} />
      </ErrorBoundary>

      <ErrorBoundary>
        <section id="quarterly-trends" className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">Quarterly <em>Trends</em></h2>
            <p className="section-sub">Quarter-over-quarter trajectory with {TRENDS_QUARTERS[2].label} pace projections.</p>
          </header>
          <div className="charts-grid">
            {METRICS.map(m => (
              <ChartCard key={m.id} metric={m} agency={agency} qdata={qdata} snaps={snapsByQuarter[TRENDS_QUARTERS[2].suffix] ?? []} calibrationFactor={calibrationFactors[m.id]} />
            ))}
          </div>
        </section>
      </ErrorBoundary>
    </main>
  );
}
