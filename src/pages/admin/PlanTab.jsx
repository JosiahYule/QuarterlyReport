import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { QUARTERS, CURRENT_QUARTER } from "../../config.js";
import {
  buildPlanSuggestion,
  buildPlanNarrative,
  buildWeekPlan,
  buildScorecard,
  buildCadence,
  buildContentMix,
  buildPerformers,
  MIN_SAMPLE_SIZE,
} from "../../lib/planEngine.js";

// The quarter right after the selected one just started — its post log is
// thin or empty until weeks in. Pull in the prior quarter's posts too so
// there's always enough sample size to find a pattern, not just whatever's
// been logged so far this quarter.
function previousQuarter(quarter) {
  const idx = QUARTERS.findIndex(q => q.suffix === quarter);
  return idx === -1 ? null : QUARTERS[idx + 1] || null;
}

function pct(rate) {
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(1)}%` : "—";
}

function fmtInt(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
}

function fmtValue(metric) {
  return metric.format === "pct" ? pct(metric.value) : fmtInt(metric.value);
}

// ─── Shared bits ────────────────────────────────────────────────────
function ConfidenceBadge({ confidence }) {
  const label = confidence === "high" ? "High confidence" : confidence === "medium" ? "Some confidence" : "Low confidence";
  return <span className={`admin-plan-confidence is-${confidence}`}>{label}</span>;
}

function Delta({ delta }) {
  if (!Number.isFinite(delta)) return <span className="admin-plan-delta is-flat">— vs last Q</span>;
  const up = delta >= 0;
  return (
    <span className={"admin-plan-delta " + (up ? "is-up" : "is-down")}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs last Q
    </span>
  );
}

// ─── Modules ────────────────────────────────────────────────────────
function Scorecard({ scorecard, liveQuarter }) {
  return (
    <div>
      <div className="admin-plan-scorecard">
        {scorecard.metrics.map(m => (
          <div key={m.key} className="admin-plan-stat">
            <div className="admin-plan-stat-label">{m.label}</div>
            <div className="admin-plan-stat-value">{fmtValue(m)}</div>
            {scorecard.hasPrev && <Delta delta={m.delta} />}
          </div>
        ))}
      </div>
      {liveQuarter && (
        <p className="admin-list-hint" style={{ marginTop: 8 }}>
          This quarter is still in progress — the totals climb as you post, so engagement rate is the
          fairest comparison to last quarter.
        </p>
      )}
    </div>
  );
}

function CadenceCard({ cadence }) {
  if (cadence.status !== "ready") return null;
  return (
    <div className={"admin-plan-cadence" + (cadence.goneDark ? " is-dark" : "")}>
      {cadence.goneDark && (
        <div className="admin-plan-cadence-alert">
          ⚠ No post in {cadence.daysSinceLast} day{cadence.daysSinceLast === 1 ? "" : "s"} — time to get something out.
        </div>
      )}
      <div className="admin-plan-cadence-stats">
        <div className="admin-plan-stat">
          <div className="admin-plan-stat-value">{cadence.daysSinceLast}</div>
          <div className="admin-plan-stat-label">days since last post</div>
        </div>
        <div className="admin-plan-stat">
          <div className="admin-plan-stat-value">{cadence.postsPerWeek.toFixed(1)}</div>
          <div className="admin-plan-stat-label">posts / week</div>
        </div>
        <div className="admin-plan-stat">
          <div className="admin-plan-stat-value">{cadence.largestGap}</div>
          <div className="admin-plan-stat-label">longest gap (days)</div>
        </div>
      </div>
    </div>
  );
}

function ContentMixTable({ mix }) {
  if (!mix.rows.length) return null;
  return (
    <table className="admin-plan-table">
      <thead>
        <tr>
          <th>Content type</th>
          <th className="r">Posts</th>
          <th className="r">Share</th>
          <th className="r">Avg. engagement</th>
          <th>Read</th>
        </tr>
      </thead>
      <tbody>
        {mix.rows.map(r => (
          <tr key={r.key}>
            <td>{r.label}</td>
            <td className="r">{r.count}</td>
            <td className="r">{Math.round(r.share * 100)}%</td>
            <td className="r">{pct(r.avgEngagementRate)}</td>
            <td>
              {r.flag === "opportunity" && <span className="admin-plan-flag is-opp">Post more</span>}
              {r.flag === "overinvested" && <span className="admin-plan-flag is-over">Ease off</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PerformerRow({ p }) {
  return (
    <li className="admin-plan-perf-row">
      <div className="admin-plan-perf-main">
        <span className="admin-plan-perf-name">
          {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.postName}</a> : p.postName}
        </span>
        <span className="admin-plan-perf-meta">{p.type} · {p.postDate}</span>
      </div>
      <span className="admin-plan-perf-rate">{pct(p.rate)}</span>
    </li>
  );
}

function Performers({ performers }) {
  if (!performers.top.length) return null;
  return (
    <div className="admin-plan-perf-grid">
      <div>
        <div className="admin-plan-perf-head is-up">Repeat these ↑</div>
        <ul className="admin-plan-perf-list">
          {performers.top.map(p => <PerformerRow key={p.postName + p.postDate} p={p} />)}
        </ul>
      </div>
      {performers.bottom.length > 0 && (
        <div>
          <div className="admin-plan-perf-head is-down">Rethink these ↓</div>
          <ul className="admin-plan-perf-list">
            {performers.bottom.map(p => <PerformerRow key={p.postName + p.postDate} p={p} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ rows, nameKey, qualified }) {
  if (!rows.length) return null;
  return (
    <table className="admin-plan-table">
      <thead>
        <tr>
          <th>{nameKey === "name" ? "Day" : "Content type"}</th>
          <th className="r">Posts</th>
          <th className="r">Avg. engagement</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} className={r.count < qualified ? "is-thin" : ""}>
            <td>{r[nameKey]}</td>
            <td className="r">{r.count}</td>
            <td className="r">{pct(r.avgEngagementRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WeekPlan({ week, todayName }) {
  return (
    <table className="admin-plan-table admin-plan-week">
      <thead>
        <tr>
          <th>Day</th>
          <th>Suggested post type</th>
          <th className="r">Track record</th>
        </tr>
      </thead>
      <tbody>
        {week.map(d => {
          const isToday = d.dayName === todayName;
          const cls = (d.confident ? "" : "is-thin") + (isToday ? " is-today" : "");
          return (
            <tr key={d.dayIndex} className={cls.trim()}>
              <td>
                {d.dayName}
                {isToday && <span className="admin-plan-today-tag">Today</span>}
              </td>
              <td>{d.bestType ? d.bestType.label : <span className="admin-plan-nodata">No posts logged yet</span>}</td>
              <td className="r">
                {d.bestType
                  ? `${d.bestType.count} post${d.bestType.count === 1 ? "" : "s"} · ${pct(d.bestType.avgEngagementRate)}`
                  : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Tab ────────────────────────────────────────────────────────────
export function PlanTab({ agency, quarter }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPosts, setCurrentPosts] = useState([]);
  const [prevPosts, setPrevPosts] = useState([]);

  const prevQ = previousQuarter(quarter);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const quarters = prevQ ? [quarter, prevQ.suffix] : [quarter];
        const { data, error } = await supabase
          .from("social_reports")
          .select("quarter, social_posts(*)")
          .eq("agency", agency)
          .in("quarter", quarters);
        if (error) throw error;
        if (!cancelled) {
          const byQuarter = {};
          for (const r of data || []) byQuarter[r.quarter] = r.social_posts || [];
          setCurrentPosts(byQuarter[quarter] || []);
          setPrevPosts(prevQ ? byQuarter[prevQ.suffix] || [] : []);
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load the post log for this quarter. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agency, quarter, prevQ]);

  if (loading)   return <div className="admin-form-status">Analyzing the post log…</div>;
  if (loadError) return <div className="admin-form-status admin-form-status--error">{loadError}</div>;

  const posts = [...currentPosts, ...prevPosts];
  const plan = buildPlanSuggestion(posts);
  const periodLabel = prevQ ? `this quarter and last quarter (${prevQ.label})` : "this quarter";

  if (plan.status === "empty") {
    return (
      <div className="admin-form-section">
        <div className="admin-plan-empty">
          No dated, logged posts with impressions yet across {periodLabel}. Add rows in the
          Social → All Posts tab (or import a CSV) to unlock posting suggestions here.
        </div>
      </div>
    );
  }

  const narrative = buildPlanNarrative(plan);
  const week = buildWeekPlan(posts);
  const scorecard = buildScorecard(currentPosts, prevPosts);
  const mix = buildContentMix(posts);
  const performers = buildPerformers(posts);
  const qMeta = QUARTERS.find(q => q.suffix === quarter);
  const cadence = buildCadence(currentPosts, { quarterStart: qMeta?.start, quarterEnd: qMeta?.end });
  const liveQuarter = quarter === CURRENT_QUARTER.suffix;

  return (
    <div className="admin-form-section">
      <div>
        <div className="admin-section-heading">{qMeta?.label || "This quarter"} at a glance</div>
        <Scorecard scorecard={scorecard} liveQuarter={liveQuarter} />
      </div>

      <div className="admin-plan-headline admin-section-card">
        <div className="admin-plan-headline-top">
          <span className="admin-label">Today — {plan.todayName}</span>
          <ConfidenceBadge confidence={plan.confidence} />
        </div>
        <p className="admin-plan-narrative">{narrative}</p>
        <p className="admin-list-hint" style={{ margin: 0 }}>
          Based on {plan.sampleSize} logged post{plan.sampleSize === 1 ? "" : "s"} across {periodLabel}{" "}
          ({pct(plan.overallRate)} avg. engagement overall). Buckets need at least {MIN_SAMPLE_SIZE} posts
          before they're trusted enough to drive a suggestion.
        </p>
      </div>

      {cadence.status === "ready" && (
        <div>
          <div className="admin-section-heading">Posting cadence</div>
          <CadenceCard cadence={cadence} />
        </div>
      )}

      <div>
        <div className="admin-section-heading">Your week at a glance</div>
        <p className="admin-list-hint">
          The content type that's historically performed best on each weekday. Not sure what to post today?
          Find {plan.todayName} below and start there.
        </p>
        <WeekPlan week={week} todayName={plan.todayName} />
      </div>

      <div>
        <div className="admin-section-heading">Content mix vs. performance</div>
        <p className="admin-list-hint">
          How much you post of each type vs. how well it does. <strong>Post more</strong> flags a type that
          punches above its weight but you rarely run; <strong>ease off</strong> flags one you lean on that
          under-delivers.
        </p>
        <ContentMixTable mix={mix} />
      </div>

      <div>
        <div className="admin-section-heading">Top &amp; underperformers</div>
        <p className="admin-list-hint">Real posts to learn from across {periodLabel}, ranked by engagement.</p>
        <Performers performers={performers} />
      </div>

      <div>
        <div className="admin-section-heading">Engagement by day of week</div>
        <BreakdownTable rows={plan.dayBreakdown} nameKey="name" qualified={MIN_SAMPLE_SIZE} />
      </div>
    </div>
  );
}
