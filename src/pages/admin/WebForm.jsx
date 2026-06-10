import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { IconClose } from "../../components/Icons.jsx";

const num = v => (v === "" || v === null || v === undefined) ? null : (isFinite(Number(v)) ? Number(v) : null);
const str = v => (v == null ? "" : String(v));

const KPI_FIELDS = [
  { key: "sessions",               label: "Total Visits (Sessions)" },
  { key: "users",                  label: "Unique Users" },
  { key: "engagement_rate",        label: "Engagement Rate (%)",       isDecimal: true },
  { key: "avg_engagement_time_sec",label: "Avg Time on Site (seconds)" },
  { key: "actions",                label: "Candidate Actions" },
  { key: "form_submissions",       label: "Form Submissions" },
];

const BLANK_CHANNEL  = { name: "", sessions: "", share_of_traffic: "", engagement_rate: "" };
const BLANK_PAGE     = { key: "", page_views: "", bounce_rate: "", avg_time_on_page_sec: "" };
const BLANK_INSIGHTS = { working: "", not_working: "", actions: "", next_quarter: "" };

const TABS = [
  { id: "overview",  label: "Overview"  },
  { id: "channels",  label: "Channels"  },
  { id: "pages",     label: "Top Pages" },
  { id: "insights",  label: "Insights"  },
];

function Field({ label, children }) {
  return (
    <div className="admin-field">
      <label className="admin-label">{label}</label>
      {children}
    </div>
  );
}

function SaveBar({ saving, message, onSave }) {
  return (
    <div className="admin-save-bar">
      {message && <span className={"admin-save-msg" + (message.startsWith("Error") ? " is-error" : "")}>{message}</span>}
      <button className="admin-btn-primary" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// Throws on Supabase error so callers don't have to destructure every response
const dbOp = async (promise) => {
  const { error } = await promise;
  if (error) throw error;
};

export function WebForm({ agency, quarter, onDirtyChange }) {
  const [tab,       setTab]      = useState("overview");
  const [saving,    setSaving]   = useState(false);
  const [saveMsg,   setSaveMsg]  = useState("");
  const [loading,   setLoading]  = useState(true);
  const [loadError, setLoadError] = useState("");

  const [summaryBullet, setSummaryBullet] = useState("");
  const [kpis,          setKpis]          = useState(Object.fromEntries(KPI_FIELDS.map(f => [f.key, ""])));
  const [channels,      setChannels]      = useState([]);
  const [pages,         setPages]         = useState([]);
  const [insights,      setInsights]      = useState(BLANK_INSIGHTS);

  // Gate that prevents the initial data load from marking the form dirty
  const canDirty = useRef(false);

  const dirty = useCallback(() => {
    if (canDirty.current) onDirtyChange?.(true);
  }, [onDirtyChange]);

  useEffect(() => {
    canDirty.current = false;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const { data, error } = await supabase
          .from("web_reports")
          .select("id, summary_bullet, web_kpis(*), web_channels(*), web_pages(*), web_insights(*)")
          .eq("agency", agency)
          .eq("quarter", quarter)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setSummaryBullet(data.summary_bullet || "");
          const k = data.web_kpis?.[0] || {};
          setKpis(Object.fromEntries(KPI_FIELDS.map(f => [f.key, k[f.key] ?? ""])));
          setChannels([...(data.web_channels || [])].sort((a, b) => a.sort_order - b.sort_order).map(c => ({
            name: c.name, sessions: str(c.sessions), share_of_traffic: str(c.share_of_traffic), engagement_rate: str(c.engagement_rate),
          })));
          setPages([...(data.web_pages || [])].sort((a, b) => a.sort_order - b.sort_order).map(p => ({
            key: p.key, page_views: str(p.page_views), bounce_rate: str(p.bounce_rate), avg_time_on_page_sec: str(p.avg_time_on_page_sec),
          })));
          const ins = data.web_insights?.[0] || {};
          setInsights({ working: ins.working || "", not_working: ins.not_working || "", actions: ins.actions || "", next_quarter: ins.next_quarter || "" });
        }
      } catch (err) {
        setLoadError("Failed to load report data. Please refresh and try again.");
      } finally {
        setLoading(false);
        canDirty.current = true;
      }
    })();
  }, [agency, quarter]);

  const flash = msg => { setSaveMsg(msg); setTimeout(() => setSaveMsg(""), 4000); };

  const save = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const { data: rep, error: e1 } = await supabase
        .from("web_reports")
        .upsert({ agency, quarter, summary_bullet: summaryBullet }, { onConflict: "agency,quarter" })
        .select("id").single();
      if (e1) throw e1;
      const rid = rep.id;

      await dbOp(supabase.from("web_kpis").delete().eq("report_id", rid));
      await dbOp(supabase.from("web_kpis").insert({
        report_id: rid,
        ...Object.fromEntries(KPI_FIELDS.map(f => [f.key, num(kpis[f.key])])),
      }));

      await dbOp(supabase.from("web_channels").delete().eq("report_id", rid));
      if (channels.length) {
        await dbOp(supabase.from("web_channels").insert(channels.map((c, i) => ({
          report_id: rid, sort_order: i, name: c.name,
          sessions: num(c.sessions), share_of_traffic: num(c.share_of_traffic), engagement_rate: num(c.engagement_rate),
        }))));
      }

      await dbOp(supabase.from("web_pages").delete().eq("report_id", rid));
      if (pages.length) {
        await dbOp(supabase.from("web_pages").insert(pages.map((p, i) => ({
          report_id: rid, sort_order: i, key: p.key,
          page_views: num(p.page_views), bounce_rate: num(p.bounce_rate), avg_time_on_page_sec: num(p.avg_time_on_page_sec),
        }))));
      }

      await dbOp(supabase.from("web_insights").delete().eq("report_id", rid));
      await dbOp(supabase.from("web_insights").insert({ report_id: rid, ...insights }));

      onDirtyChange?.(false);
      flash("Saved ✓");
    } catch (err) {
      flash("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)   return <div className="admin-form-status">Loading report data…</div>;
  if (loadError) return <div className="admin-form-status admin-form-status--error">{loadError}</div>;

  return (
    <div className="admin-form">
      <div className="admin-section-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={"admin-section-tab" + (tab === t.id ? " is-active" : "")}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="admin-form-section">
          <Field label="Executive summary / bullet">
            <textarea className="admin-textarea" rows={3} value={summaryBullet}
              onChange={e => { setSummaryBullet(e.target.value); dirty(); }}
              placeholder="One-line summary shown at the top of the web report…" />
          </Field>
          <div className="admin-kpi-grid">
            {KPI_FIELDS.map(f => (
              <Field key={f.key} label={f.label}>
                <input type="number" className="admin-input" value={kpis[f.key]}
                  step={f.isDecimal ? "0.001" : "1"}
                  onChange={e => { setKpis(k => ({ ...k, [f.key]: e.target.value })); dirty(); }} />
              </Field>
            ))}
          </div>
        </div>
      )}

      {/* Channels */}
      {tab === "channels" && (
        <div className="admin-form-section">
          <div className="admin-list-hint">Traffic channels from GA4 — Organic Search, Direct, Social, etc.</div>
          {channels.map((c, i) => (
            <div key={i} className="admin-list-row">
              <div className="admin-list-row-grid admin-channel-grid">
                <Field label="Channel name">
                  <input type="text" className="admin-input" value={c.name}
                    onChange={e => { setChannels(cs => cs.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Sessions">
                  <input type="number" className="admin-input" value={c.sessions}
                    onChange={e => { setChannels(cs => cs.map((x, j) => j === i ? { ...x, sessions: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Share of Traffic (%)">
                  <input type="number" step="0.001" className="admin-input" value={c.share_of_traffic}
                    onChange={e => { setChannels(cs => cs.map((x, j) => j === i ? { ...x, share_of_traffic: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Engagement Rate (%)">
                  <input type="number" step="0.001" className="admin-input" value={c.engagement_rate}
                    onChange={e => { setChannels(cs => cs.map((x, j) => j === i ? { ...x, engagement_rate: e.target.value } : x)); dirty(); }} />
                </Field>
              </div>
              <button className="admin-btn-remove"
                onClick={() => { setChannels(cs => cs.filter((_, j) => j !== i)); dirty(); }}
                aria-label="Remove"><IconClose /></button>
            </div>
          ))}
          <button className="admin-btn-add"
            onClick={() => { setChannels(cs => [...cs, { ...BLANK_CHANNEL }]); dirty(); }}>
            + Add channel
          </button>
        </div>
      )}

      {/* Pages */}
      {tab === "pages" && (
        <div className="admin-form-section">
          <div className="admin-list-hint">Top landing pages by traffic volume.</div>
          {pages.map((p, i) => (
            <div key={i} className="admin-list-row">
              <div className="admin-list-row-grid admin-page-grid">
                <Field label="Page / path">
                  <input type="text" className="admin-input" value={p.key} placeholder="/jobs, Homepage…"
                    onChange={e => { setPages(ps => ps.map((x, j) => j === i ? { ...x, key: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Page Views">
                  <input type="number" className="admin-input" value={p.page_views}
                    onChange={e => { setPages(ps => ps.map((x, j) => j === i ? { ...x, page_views: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Bounce Rate (%)">
                  <input type="number" step="0.001" className="admin-input" value={p.bounce_rate}
                    onChange={e => { setPages(ps => ps.map((x, j) => j === i ? { ...x, bounce_rate: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Avg Time on Page (sec)">
                  <input type="number" className="admin-input" value={p.avg_time_on_page_sec}
                    onChange={e => { setPages(ps => ps.map((x, j) => j === i ? { ...x, avg_time_on_page_sec: e.target.value } : x)); dirty(); }} />
                </Field>
              </div>
              <button className="admin-btn-remove"
                onClick={() => { setPages(ps => ps.filter((_, j) => j !== i)); dirty(); }}
                aria-label="Remove"><IconClose /></button>
            </div>
          ))}
          <button className="admin-btn-add"
            onClick={() => { setPages(ps => [...ps, { ...BLANK_PAGE }]); dirty(); }}>
            + Add page
          </button>
        </div>
      )}

      {/* Insights */}
      {tab === "insights" && (
        <div className="admin-form-section admin-insights-grid">
          {[
            { key: "working",      label: "What's working" },
            { key: "not_working",  label: "What's not working" },
            { key: "actions",      label: "Actions from this data" },
            { key: "next_quarter", label: "Next quarter focus" },
          ].map(s => (
            <Field key={s.key} label={s.label}>
              <textarea className="admin-textarea" rows={6} value={insights[s.key]}
                onChange={e => { setInsights(ins => ({ ...ins, [s.key]: e.target.value })); dirty(); }} />
            </Field>
          ))}
        </div>
      )}

      <SaveBar saving={saving} message={saveMsg} onSave={save} />
    </div>
  );
}
