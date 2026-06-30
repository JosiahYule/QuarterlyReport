import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { buildPlanSuggestion, buildPlanNarrative, MIN_SAMPLE_SIZE } from "../../lib/planEngine.js";

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const { data, error } = await supabase
          .from("social_reports")
          .select("social_posts(*)")
          .eq("agency", agency)
          .eq("quarter", quarter)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setPosts(data?.social_posts || []);
      } catch {
        if (!cancelled) setLoadError("Failed to load the post log for this quarter. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agency, quarter]);

  if (loading)   return <div className="admin-form-status">Analyzing this quarter's post log…</div>;
  if (loadError) return <div className="admin-form-status admin-form-status--error">{loadError}</div>;

  const plan = buildPlanSuggestion(posts);

  if (plan.status === "empty") {
    return (
      <div className="admin-form-section">
        <div className="admin-plan-empty">
          No dated, logged posts with impressions yet for this quarter. Add rows in the
          Social → All Posts tab (or import a CSV) to unlock posting suggestions here.
        </div>
      </div>
    );
  }

  const narrative = buildPlanNarrative(plan);

  return (
    <div className="admin-form-section">
      <div className="admin-plan-headline admin-section-card">
        <div className="admin-plan-headline-top">
          <span className="admin-label">Today — {plan.todayName}</span>
          <ConfidenceBadge confidence={plan.confidence} />
        </div>
        <p className="admin-plan-narrative">{narrative}</p>
        <p className="admin-list-hint" style={{ margin: 0 }}>
          Based on {plan.sampleSize} logged post{plan.sampleSize === 1 ? "" : "s"} this quarter
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
    </div>
  );
}
