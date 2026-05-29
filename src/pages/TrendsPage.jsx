import React, { useEffect, useRef, useMemo } from "react";
import Chart from "chart.js/auto";
import { useTrendsData, METRICS, extractMetric, computeAdvancedPace, getMetricHistory, quarterCompletion, quarterComplete } from "../hooks/useTrendsData.js";
import { TRENDS_QUARTERS, AGENCIES } from "../config.js";
import { fmt, fmtApprox } from "../utils.js";
import { PageLoader } from "../components/PageLoader.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";

// Chart colours
const C = {
  q1:   "rgba(100,116,139,.7)",
  q2:   "rgba(0,61,114,.8)",
  q3:   "rgba(0,84,154,.85)",
  proj: "rgba(180,130,0,.85)",
};

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

    const canvasRect = chart.canvas.getBoundingClientRect();
    const containerRect = chart.canvas.parentNode.getBoundingClientRect();
    const x = tooltip.caretX;
    const y = tooltip.caretY;

    el.style.opacity = "1";
    el.style.left = x + "px";
    el.style.top  = y + "px";
  };
}

// ─── Chart card ───────────────────────────────────────────────────
function ChartCard({ metric, agency, qdata }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
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
    ? computeAdvancedPace(q3input, q3.start, q3.end, q2Rate, getMetricHistory(agency, metric.id), histBaseline)
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

  const sub = done ? "Quarter-over-quarter actuals" : "Q1 & Q2 actuals · Q3 pace projection";

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
  }, [agency, JSON.stringify(values)]);

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

// ─── Projection card ──────────────────────────────────────────────
function ProjCard({ metric, agency, qdata, q3comp, q3done }) {
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
    ? computeAdvancedPace(q3input, tq3.start, tq3.end, q2Rate, getMetricHistory(agency, metric.id), histBaseline)
    : null;

  const projected = pace?.projected ?? null;
  const rateVsQ2  = pace && q2Rate ? ((pace.dailyRate - q2Rate) / q2Rate * 100) : null;
  const headlineVal = projected !== null && metric.baselineFromQ2 && q2v !== null ? q2v + projected : projected;
  const headline  = headlineVal !== null ? fmtApprox(headlineVal, metric.isPercent) : fmt(q3v, metric.isPercent);
  const ql = tq3.label;
  const headlineSub = headlineVal !== null
    ? (q3done ? (metric.baselineFromQ2 ? `${ql} Projected Total` : `${ql} Final`)
               : (metric.baselineFromQ2 ? `Projected Total · ${ql}` : `Projected Final · ${ql}`))
    : (metric.baselineFromQ2 ? `${ql} Current Total` : `${ql} Current`);

  const dElapsed = pace ? Math.round(pace.dElapsed) : 0;
  const dTotal   = pace ? Math.round(pace.dTotal)   : 92;
  const pct      = (q3comp * 100).toFixed(1);

  const stat1Label = metric.baselineFromQ2 ? `${ql} Net New` : `${ql} to Date`;
  const stat1Val   = metric.baselineFromQ2 && q3v !== null && q2v !== null ? fmt(q3v - q2v, metric.isPercent) : fmt(q3v, metric.isPercent);

  const stat2Val = pace
    ? (metric.isPercent ? `${pace.dailyRate.toFixed(3)}%/day` : `${pace.dailyRate.toFixed(1)}/day`)
    : "—";

  let stat3Val = "—", stat3Cls = "na";
  if (rateVsQ2 !== null) {
    const sign = rateVsQ2 >= 0 ? "▲ +" : "▼ ";
    stat3Val = `${sign}${Math.abs(rateVsQ2).toFixed(1)}%`;
    stat3Cls = rateVsQ2 >= 0 ? "pos" : "neg";
  } else if (!metric.isPace) {
    stat3Val = "n/a";
  }

  return (
    <div className="proj-card">
      <div className="proj-card-label">{metric.label}</div>
      <div className="proj-number serif">{headline}</div>
      <div className="proj-number-sub">{headlineSub}</div>
      <div className="proj-progress-wrap">
        <div className="proj-progress-track" role="progressbar" aria-valuenow={Math.round(q3comp * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${tq3.label} ${Math.round(q3comp * 100)}% elapsed`}>
          <div className="proj-progress-fill" style={{ width: `${Math.min(100, q3comp * 100).toFixed(1)}%` }} />
        </div>
        <div className="proj-progress-labels" aria-hidden="true">
          <span>Day {dElapsed} of {dTotal}{q3done ? " · complete" : ""}</span>
          <span>{pct}%</span>
        </div>
      </div>
      <div className="proj-stats-grid">
        <div className="proj-stat">
          <div className="proj-stat-label">{stat1Label}</div>
          <div className="proj-stat-value">{stat1Val}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">Daily Rate</div>
          <div className={"proj-stat-value rate"}>{stat2Val}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">Rate vs Q2</div>
          <div className={"proj-stat-value " + stat3Cls}>{stat3Val}</div>
        </div>
        <div className="proj-stat">
          <div className="proj-stat-label">{tq2.label} Actual</div>
          <div className="proj-stat-value">{fmt(q2v, metric.isPercent)}</div>
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

// ─── Page ─────────────────────────────────────────────────────────
export function TrendsPage({ agency, onReady }) {
  const { qdata, status, error } = useTrendsData(agency);

  useEffect(() => {
    if (status === "ready" || status === "error") onReady?.();
  }, [status, onReady]);

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
      <ErrorBoundary><Hero agency={agency} q3comp={q3comp} q3done={q3done} /></ErrorBoundary>

      <ErrorBoundary>
        <section className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">Q3 Projected Finals</h2>
            <p className="section-sub">Estimated end-of-quarter totals based on observed daily rate × total quarter days.</p>
          </header>
          <div className="proj-grid">
            {METRICS.map(m => (
              <ProjCard key={m.id} metric={m} agency={agency} qdata={qdata} q3comp={q3comp} q3done={q3done} />
            ))}
          </div>
        </section>
      </ErrorBoundary>

      <ErrorBoundary>
        <section className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">Quarterly Trends</h2>
            <p className="section-sub">Quarter-over-quarter trajectory with Q3 pace projections.</p>
          </header>
          <div className="charts-grid">
            {METRICS.map(m => (
              <ChartCard key={m.id} metric={m} agency={agency} qdata={qdata} />
            ))}
          </div>
        </section>
      </ErrorBoundary>
    </main>
  );
}
