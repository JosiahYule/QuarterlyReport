import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { QUARTERS, CURRENT_QUARTER } from "../../config.js";
import { WeekCalendar } from "./WeekCalendar.jsx";
import { useWebReport } from "../../hooks/useWebReport.js";
import {
  buildPlanSuggestion,
  buildPlanNarrative,
  buildWeekPlan,
  buildScorecard,
  buildCadence,
  buildContentFreshness,
  buildContentMix,
  buildPerformers,
  MIN_SAMPLE_SIZE,
} from "../../lib/planEngine.js";
import {
  buildPlatformFocusSignal,
  buildJobAdSignal,
  buildWebFunnelSignal,
  buildSignalNarratives,
} from "../../lib/planSignals.js";

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

// Paid media, as fetched raw alongside social_posts/social_platforms in this
// tab's own query, into the shape planSignals.buildJobAdSignal expects (a
// list of campaign-like objects with a camelCase `ads` array) — the same
// normalization useSocialReport.js's mapPaidMedia does for the Social report.
function normalizePaidMediaForSignal(campaigns) {
  return [{
    ads: (campaigns || []).flatMap(c => (c.paid_media_ads || []).map(a => ({
      impressions: a.impressions, clicks: a.clicks, cpc: a.cpc, engagementRate: a.engagement_rate,
    }))),
  }];
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

function BreakdownTable({ rows, nameKey, qualified, header }) {
  if (!rows.length) return null;
  const col = header || (nameKey === "name" ? "Day" : "Content type");
  return (
    <table className="admin-plan-table">
      <thead>
        <tr>
          <th>{col}</th>
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

// ─── Signals strip ──────────────────────────────────────────────────
// Everything worth flagging today, condensed to one line each: today's
// deterministic pick, any cross-page signal that actually fired (job-ad
// paid vs organic, platform focus, web funnel), a cadence alert if posting's
// gone dark, and any content type that's gone noticeably stale. Anything
// that isn't actionable renders nothing at all — no "everything's fine"
// filler, so a quiet week reads as a short list, not an empty section.
function SignalLine({ tone, children }) {
  return <div className={"admin-plan-signal" + (tone ? ` is-${tone}` : "")}>{children}</div>;
}

function Signals({ plan, cadence, freshness, crossPageLines }) {
  const narrative = buildPlanNarrative(plan);
  const goneDark = cadence.status === "ready" && cadence.goneDark;
  const staleRows = freshness.rows.filter(r => r.stale);

  if (!narrative && !crossPageLines.length && !goneDark && !staleRows.length) return null;

  return (
    <div className="admin-plan-signals">
      {narrative && (
        <div className="admin-plan-signal admin-plan-signal--today">
          <div className="admin-plan-headline-top">
            <span className="admin-label">Today — {plan.todayName}</span>
            <ConfidenceBadge confidence={plan.confidence} />
          </div>
          <p className="admin-plan-narrative">{narrative}</p>
        </div>
      )}
      {crossPageLines.map((line, i) => <SignalLine key={`x${i}`}>{line}</SignalLine>)}
      {goneDark && (
        <SignalLine tone="down">
          ⚠ No post in {cadence.daysSinceLast} day{cadence.daysSinceLast === 1 ? "" : "s"} — time to get something out.
        </SignalLine>
      )}
      {staleRows.map(r => (
        <SignalLine key={r.key} tone="down">
          ⚠ {r.label} — last posted {r.daysSinceLast} day{r.daysSinceLast === 1 ? "" : "s"} ago
          {Number.isFinite(r.avgGap) ? ` (usually every ~${Math.round(r.avgGap)} days)` : ""}.
        </SignalLine>
      ))}
    </div>
  );
}

// ─── Tab ────────────────────────────────────────────────────────────
export function PlanTab({ agency, quarter }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPosts, setCurrentPosts] = useState([]);
  const [prevPosts, setPrevPosts] = useState([]);
  const [currentPlatforms, setCurrentPlatforms] = useState([]);
  const [prevPlatforms, setPrevPlatforms] = useState([]);
  const [currentPaidMedia, setCurrentPaidMedia] = useState([]);
  const [plannedItems, setPlannedItems] = useState([]);

  const prevQ = previousQuarter(quarter);
  const { data: webData, prevData: prevWebData } = useWebReport(agency, quarter);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const quarters = prevQ ? [quarter, prevQ.suffix] : [quarter];
        const [reportsRes, plannedRes] = await Promise.all([
          supabase
            .from("social_reports")
            .select("quarter, social_posts(*), social_platforms(*), paid_media_campaigns(*, paid_media_ads(*))")
            .eq("agency", agency)
            .in("quarter", quarters),
          supabase
            .from("plan_items")
            .select("content_type, planned_date, idea, status")
            .eq("agency", agency)
            .eq("quarter", quarter)
            .eq("status", "planned"),
        ]);
        if (reportsRes.error) throw reportsRes.error;
        if (!cancelled) {
          const byQuarter = {};
          for (const r of reportsRes.data || []) byQuarter[r.quarter] = r;
          const cur = byQuarter[quarter] || {};
          const prev = prevQ ? byQuarter[prevQ.suffix] || {} : {};
          setCurrentPosts(cur.social_posts || []);
          setPrevPosts(prev.social_posts || []);
          setCurrentPlatforms(cur.social_platforms || []);
          setPrevPlatforms(prev.social_platforms || []);
          setCurrentPaidMedia(cur.paid_media_campaigns || []);
          // The planner and cross-page signals are best-effort, secondary
          // signals — don't fail the whole tab if either can't be read.
          setPlannedItems(plannedRes.error ? [] : plannedRes.data || []);
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
  const isEmpty = plan.status === "empty";
  const qMeta = QUARTERS.find(q => q.suffix === quarter);

  const platformFocus = buildPlatformFocusSignal(currentPlatforms, prevPlatforms);
  const jobAdSignal = buildJobAdSignal(posts, normalizePaidMediaForSignal(currentPaidMedia));
  const webFunnel = buildWebFunnelSignal(webData, prevWebData);
  const crossPageLines = buildSignalNarratives({ platformFocus, jobAdSignal, webFunnel });

  // Suggestions are only ever meaningful when there's a real pattern to
  // suggest from — an empty post log still gets a fully functional calendar
  // for capturing and scheduling ideas, just without a fabricated pick.
  const week = isEmpty ? [] : buildWeekPlan(posts, { plannedItems, platformFocus, jobAdSignal, webFunnel });
  const cadence = buildCadence(currentPosts, { quarterStart: qMeta?.start, quarterEnd: qMeta?.end });
  const freshness = buildContentFreshness(posts);

  return (
    <div className="admin-form-section">
      {!isEmpty && (
        <div>
          <div className="admin-section-heading">{qMeta?.label || "This quarter"} at a glance</div>
          <Scorecard scorecard={buildScorecard(currentPosts, prevPosts)} liveQuarter={quarter === CURRENT_QUARTER.suffix} />
        </div>
      )}

      {!isEmpty && <Signals plan={plan} cadence={cadence} freshness={freshness} crossPageLines={crossPageLines} />}

      <WeekCalendar
        agency={agency}
        quarter={quarter}
        posts={currentPosts}
        week={week}
        quarterStart={qMeta?.start}
        quarterEnd={qMeta?.end}
      />

      {isEmpty ? (
        <div className="admin-plan-empty">
          No dated, logged posts with impressions yet across {periodLabel}, so the analytics below are empty.
          Add rows in the Social → All Posts tab (or import a CSV) to unlock posting suggestions.
        </div>
      ) : (
        <details className="admin-plan-details">
          <summary>Full breakdown</summary>
          <div className="admin-plan-details-body">
            {cadence.status === "ready" && (
              <div>
                <div className="admin-section-heading">Posting cadence</div>
                <CadenceCard cadence={cadence} />
              </div>
            )}

            <div>
              <div className="admin-section-heading">Content mix vs. performance</div>
              <p className="admin-list-hint">
                How much you post of each type vs. how well it does. <strong>Post more</strong> flags a type that
                punches above its weight but you rarely run; <strong>ease off</strong> flags one you lean on that
                under-delivers.
              </p>
              <ContentMixTable mix={buildContentMix(posts)} />
            </div>

            <div>
              <div className="admin-section-heading">Top &amp; underperformers</div>
              <p className="admin-list-hint">Real posts to learn from across {periodLabel}, ranked by engagement.</p>
              <Performers performers={buildPerformers(posts)} />
            </div>

            <div>
              <div className="admin-section-heading">Engagement by day of week</div>
              <BreakdownTable rows={plan.dayBreakdown} nameKey="name" qualified={MIN_SAMPLE_SIZE} />
            </div>

            {plan.timeBreakdown.length > 0 && (
              <div>
                <div className="admin-section-heading">Engagement by time of day</div>
                <p className="admin-list-hint">
                  Based on the optional Time field on each post in the All Posts log — rows logged before that
                  field existed aren't included yet.
                </p>
                <BreakdownTable rows={plan.timeBreakdown} nameKey="label" header="Time of day" qualified={MIN_SAMPLE_SIZE} />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
