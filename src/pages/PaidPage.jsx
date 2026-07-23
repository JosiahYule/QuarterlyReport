import React, { useState, useEffect } from "react";
import { usePaidReport } from "../hooks/usePaidReport.js";
import { Delta } from "../components/Delta.jsx";
import { PageLoader } from "../components/PageLoader.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { EmptyData } from "../components/EmptyState.jsx";
import { fmt, fmtExact, adSpend } from "../utils.js";
import { CountUp } from "../components/CountUp.jsx";
import { SectionRail } from "../components/SectionRail.jsx";

// ─── Formatters ───────────────────────────────────────────────────
const money0 = v => (v != null ? "$" + fmt(v) : "—");
const money2 = v => (v != null ? "$" + v.toFixed(2) : "—");
const pct    = v => (v != null ? v.toFixed(2) + "%" : "—");
const freq   = v => (v != null ? v.toFixed(2) + "×" : "—");

// Parse a Postgres `date` ("YYYY-MM-DD") as a local calendar day — building it
// from parts avoids the UTC-midnight shift that would drag the date backwards
// for viewers west of UTC. Mirrors parsePostDate on the Social page.
function parseDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatFlight(start, end) {
  const s = parseDate(start), e = parseDate(end);
  const opts = { month: "short", day: "numeric" };
  if (s && e) return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  if (s) return `From ${s.toLocaleDateString(undefined, opts)}`;
  if (e) return `Until ${e.toLocaleDateString(undefined, opts)}`;
  return "";
}

// Ad "health" reads on click-through rate rather than engagement rate — CTR is
// the metric paid social is optimized against, and typical paid-social
// benchmarks (LinkedIn/Facebook) run far below organic engagement rates, so the
// thresholds here are tuned lower than the Social page's healthForPost.
function healthForAd(ad) {
  const impressions = ad.impressions;
  const clicks = ad.clicks;
  if (!impressions || impressions <= 0 || clicks == null) {
    return { label: "No data", color: "var(--ink-4)", ctr: null, hasData: false };
  }
  const ctr = (clicks / impressions) * 100;
  const label = ctr >= 2 ? "Very Strong" : ctr >= 1 ? "Strong" : ctr >= 0.5 ? "Moderate" : "Low";
  const color = ctr >= 2 ? "var(--accent)" : ctr >= 1 ? "var(--up)" : ctr >= 0.5 ? "#b87000" : "var(--down)";
  return { label, color, ctr, hasData: true };
}

const AD_STATUS_META = {
  active:    { label: "Active",    className: "is-active" },
  paused:    { label: "Paused",    className: "is-paused" },
  completed: { label: "Completed", className: "is-completed" },
  draft:     { label: "Draft",     className: "is-draft" },
};

function AdStatusTag({ status }) {
  const meta = AD_STATUS_META[status];
  if (!meta) return null;
  return <span className={"paid-media-status " + meta.className}>{meta.label}</span>;
}

// ─── Hero ─────────────────────────────────────────────────────────
function Hero({ data }) {
  const named = data.platforms.filter(p => p.name !== "Unspecified").length;
  const campaigns = data.campaigns.length;
  const parts = [];
  if (campaigns) parts.push(`${campaigns} campaign${campaigns === 1 ? "" : "s"}`);
  if (data.totals.spend != null) parts.push(`${money0(data.totals.spend)} invested`);
  if (named) parts.push(`${named} platform${named === 1 ? "" : "s"}`);
  const note = parts.join(" · ");

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
        <div className="hero-b-type">Paid Media</div>
      </div>
      {note && <p className="hero-b-note">{note}</p>}
    </section>
  );
}

// ─── The Numbers (blended totals) ─────────────────────────────────
const NUMBERS_DEFS = [
  { key: "spend",          label: "Total Spend",  fmt: money0,   note: "invested this quarter" },
  { key: "impressions",    label: "Impressions",  fmt: fmt,      note: "total ad views served" },
  { key: "reach",          label: "Reach",        fmt: fmt,      note: "unique people reached" },
  { key: "clicks",         label: "Clicks",       fmt: fmtExact, note: "link + action clicks" },
  { key: "ctr",            label: "Blended CTR",  fmt: pct,      note: "clicks per impression" },
  { key: "conversions",    label: "Conversions",  fmt: fmtExact, note: "leads + actions taken" },
  { key: "conversionRate", label: "Conv. Rate",   fmt: pct,      note: "conversions per click" },
  // Lower is the win on cost metrics, so their delta colour is inverted.
  { key: "cpc",            label: "Blended CPC",  fmt: money2,   note: "cost per click",              invert: true },
  { key: "cpm",            label: "CPM",          fmt: money2,   note: "cost per 1,000 impressions",  invert: true },
  { key: "cpa",            label: "Cost / Conv.", fmt: money2,   note: "cost per conversion",         invert: true },
];

function Numbers({ data }) {
  return (
    <section id="numbers" className="section wrap kpi-section" aria-label="Paid media key metrics">
      <header className="section-head">
        <h2 className="section-title serif">The <em>Numbers</em></h2>
      </header>
      <div className="kpi-grid">
        {NUMBERS_DEFS.map((k, i) => (
          <div className="kpi" key={k.key} style={{ "--i": i }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value num"><CountUp value={data.totals[k.key]} format={k.fmt} /></div>
            <div className="kpi-foot">
              <Delta d={data.deltas[k.key]} invertGood={!!k.invert} />
              <span className="delta-note">{k.note}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── By Platform ──────────────────────────────────────────────────
function Platforms({ data }) {
  return (
    <section id="platforms" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">By <em>Platform</em></h2>
      </header>
      <div className="table-wrap">
        <table className="table table--wide">
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col" className="r">Campaigns</th>
              <th scope="col" className="r">Spend</th>
              <th scope="col" className="r">Impressions</th>
              <th scope="col" className="r">Clicks</th>
              <th scope="col" className="r">CTR</th>
              <th scope="col" className="r">Conv.</th>
              <th scope="col" className="r">Cost / Conv.</th>
            </tr>
          </thead>
          <tbody>
            {data.platforms.map(p => (
              <tr key={p.name}>
                <td><span className="campaign-name serif">{p.name}</span></td>
                <td className="r num">{p.campaignCount}</td>
                <td className="r num">{money0(p.spend)}</td>
                <td className="r num">{fmtExact(p.impressions)}</td>
                <td className="r num">{fmtExact(p.clicks)}</td>
                <td className="r num">{pct(p.ctr)}</td>
                <td className="r num">{fmtExact(p.conversions)}</td>
                <td className="r num">{money2(p.cpa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Campaigns ────────────────────────────────────────────────────
function Stat({ label, value }) {
  return (
    <div className="paid-stat">
      <div className="paid-stat-label">{label}</div>
      <div className="paid-stat-value serif num">{value}</div>
    </div>
  );
}

function Budget({ budget, spent }) {
  if (budget == null || budget <= 0) return null;
  const used = spent != null ? (spent / budget) * 100 : null;
  const over = used != null && used > 100;
  return (
    <div className="paid-budget">
      <div className="paid-budget-track">
        <div
          className={"paid-budget-fill" + (over ? " is-over" : "")}
          style={{ width: `${Math.min(100, Math.max(0, used ?? 0))}%` }}
        />
      </div>
      <div className="paid-budget-foot">
        <span><strong className="num">{money0(spent)}</strong> spent of <span className="num">{money0(budget)}</span></span>
        <span className="num">{used != null ? Math.round(used) + "% of budget" : "—"}</span>
      </div>
    </div>
  );
}

function Campaign({ c }) {
  const t = c.totals;
  const flight = formatFlight(c.startDate, c.endDate);
  return (
    <div className="paid-campaign">
      <div className="paid-campaign-head">
        <h3 className="paid-campaign-name serif">{c.name || "Untitled campaign"}</h3>
        <div className="paid-campaign-tags">
          {c.platform && <span className="paid-tag paid-tag--platform">{c.platform}</span>}
          {c.objective && <span className="paid-tag">{c.objective}</span>}
          {flight && <span className="paid-tag paid-tag--muted">{flight}</span>}
        </div>
      </div>

      <Budget budget={c.budget} spent={t.spend} />

      {c.ads.length === 0 ? (
        <EmptyData label="No ads added to this campaign yet." />
      ) : (
        <>
          <div className="paid-stat-strip">
            <Stat label="Frequency"    value={freq(t.frequency)} />
            <Stat label="CPM"          value={money2(t.cpm)} />
            <Stat label="Conv. Rate"   value={pct(t.conversionRate)} />
            <Stat label="Cost / Conv." value={money2(t.cpa)} />
          </div>

          <div className="table-wrap">
            <table className="table table--wide">
              <thead>
                <tr>
                  <th scope="col">Ad</th>
                  <th scope="col" className="r">Impressions</th>
                  <th scope="col" className="r">Reach</th>
                  <th scope="col" className="r">Clicks</th>
                  <th scope="col" className="r">CTR</th>
                  <th scope="col" className="r">Conv.</th>
                  <th scope="col" className="r">Spend</th>
                  <th scope="col" className="r">CPC</th>
                  <th scope="col" className="r">Eng. Rate</th>
                  <th scope="col" className="health-col">Health</th>
                </tr>
              </thead>
              <tbody>
                {c.ads.map(ad => {
                  const { label, color, ctr, hasData } = healthForAd(ad);
                  return (
                    <tr key={ad.id}>
                      <td>
                        <span className="campaign-name serif">{ad.name || "Untitled ad"}</span>
                        <AdStatusTag status={ad.status} />
                      </td>
                      <td className="r num">{fmtExact(ad.impressions)}</td>
                      <td className="r num">{fmtExact(ad.reach)}</td>
                      <td className="r num">{fmtExact(ad.clicks)}</td>
                      <td className="r num">{hasData ? ctr.toFixed(2) + "%" : "—"}</td>
                      <td className="r num">{fmtExact(ad.conversions)}</td>
                      <td className="r num">{money2(adSpend(ad))}</td>
                      <td className="r num">{ad.cpc != null ? "$" + ad.cpc.toFixed(2) : "—"}</td>
                      <td className="r num">{ad.engagementRate != null ? ad.engagementRate.toFixed(2) + "%" : "—"}</td>
                      <td className="health-col"><span className="health-label" style={{ color }}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="paid-media-totals-row">
                  <td>Campaign total</td>
                  <td className="r num">{fmtExact(t.impressions)}</td>
                  <td className="r num">{fmtExact(t.reach)}</td>
                  <td className="r num">{fmtExact(t.clicks)}</td>
                  <td className="r num">{pct(t.ctr)}</td>
                  <td className="r num">{fmtExact(t.conversions)}</td>
                  <td className="r num">{money2(t.spend)}</td>
                  <td className="r num">{money2(t.cpc)}</td>
                  <td className="r num">{pct(t.engagementRate)}</td>
                  <td className="health-col" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Campaigns({ data }) {
  return (
    <section id="campaigns" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif"><em>Campaigns</em></h2>
      </header>
      <div className="paid-media-campaigns">
        {data.campaigns.map(c => <Campaign c={c} key={c.id} />)}
      </div>
    </section>
  );
}

const PAID_SECTIONS = [
  { id: "numbers",   label: "The Numbers" },
  { id: "platforms", label: "By Platform" },
  { id: "campaigns", label: "Campaigns" },
];

// ─── Page ─────────────────────────────────────────────────────────
export function PaidPage({ agency, quarter, onReady }) {
  const [retryKey, setRetryKey] = useState(0);
  const { data, status, error } = usePaidReport(agency, quarter, retryKey);

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

  if (!data) return <PageLoader view="paid" />;

  // Only worth its own section once there's more than one platform to compare,
  // or a single named one (an all-"Unspecified" rollup just echoes the totals).
  const showPlatforms = data.platforms.length > 1
    || (data.platforms.length === 1 && data.platforms[0].name !== "Unspecified");

  return (
    <main className="report-wrap">
      <SectionRail sections={PAID_SECTIONS} />
      <ErrorBoundary><Hero data={data} /></ErrorBoundary>
      {data.hasData ? (
        <>
          <ErrorBoundary><Numbers data={data} /></ErrorBoundary>
          {showPlatforms && <ErrorBoundary><Platforms data={data} /></ErrorBoundary>}
          <ErrorBoundary><Campaigns data={data} /></ErrorBoundary>
        </>
      ) : (
        <section className="section wrap">
          <header className="section-head">
            <h2 className="section-title serif">Paid <em>Media</em></h2>
          </header>
          <EmptyData label="No paid media campaigns recorded this quarter." />
        </section>
      )}
    </main>
  );
}
