import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { QUARTERS } from "../../config.js";
import { buildPlanSuggestion, buildPlanNarrative, buildWeekPlan, MIN_SAMPLE_SIZE } from "../../lib/planEngine.js";

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

function ConfidenceBadge({ confidence }) {
  const label = confidence === "high" ? "High confidence" : confidence === "medium" ? "Some confidence" : "Low confidence";
  return <span className={`admin-plan-confidence is-${confidence}`}>{label}</span>;
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

export function PlanTab({ agency, quarter }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [posts, setPosts] = useState([]);

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
        if (!cancelled) setPosts((data || []).flatMap(r => r.social_posts || []));
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

  return (
    <div className="admin-form-section">
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

      <div>
        <div className="admin-section-heading">Engagement by content type</div>
        <BreakdownTable rows={plan.typeBreakdown} nameKey="label" qualified={MIN_SAMPLE_SIZE} />
      </div>

      <div>
        <div className="admin-section-heading">Engagement by day of week</div>
        <BreakdownTable rows={plan.dayBreakdown} nameKey="name" qualified={MIN_SAMPLE_SIZE} />
      </div>

      <div>
        <div className="admin-section-heading">Your week at a glance</div>
        <p className="admin-list-hint">
          The content type that's historically performed best on each weekday. Not sure what to post today?
          Find {plan.todayName} below and start there.
        </p>
        <WeekPlan week={week} todayName={plan.todayName} />
      </div>
    </div>
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
