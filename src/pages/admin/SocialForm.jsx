import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { IconClose } from "../../components/Icons.jsx";

const num = v => (v === "" || v === null || v === undefined) ? null : (isFinite(Number(v)) ? Number(v) : null);
const str = v => (v == null ? "" : String(v));

const KPI_FIELDS = [
  { key: "posts",              label: "Posts Published",     isDecimal: false },
  { key: "impressions",        label: "Impressions",          isDecimal: false },
  { key: "reactions",          label: "Reactions",            isDecimal: false },
  { key: "shares",             label: "Shares",               isDecimal: false },
  { key: "followers",          label: "Followers",            isDecimal: false },
  { key: "link_clicks",        label: "Link Clicks",          isDecimal: false },
  { key: "comments",           label: "Comments",             isDecimal: false },
  { key: "avg_engagement_rate",label: "Avg Engagement Rate (%)", isDecimal: true },
];

const PLATFORMS_LIST = ["LinkedIn", "Facebook", "Instagram"];
const TOP_PLATFORMS  = ["linkedin", "facebook", "instagram"];

const BLANK_KPI      = Object.fromEntries(KPI_FIELDS.map(f => [f.key, ""]));
const BLANK_PLATFORM = { name: "", followers: "", engagement_rate: "", page_reach: "", page_clicks: "", note: "" };
const BLANK_POST     = { title: "", impressions: "", likes: "", shares: "" };
const BLANK_ALL_POST = { post_name: "", post_date: "", platforms: "", impressions: "", engagements: "", url: "", notes: "" };
const BLANK_INSIGHTS = { working: "", not_working: "", actions: "", next_quarter: "" };

const newAd       = () => ({ id: crypto.randomUUID(), name: "", impressions: "", clicks: "", cpc: "", engagement_rate: "" });
const newCampaign = () => ({ id: crypto.randomUUID(), name: "", ads: [] });

// ─── CSV import parser ────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const find = (...candidates) => candidates.reduce((found, c) => found !== -1 ? found : headers.findIndex(h => h.includes(c)), -1);
  const iName  = find("post name", "name", "title", "description");
  const iDate  = find("date");
  const iPlat  = find("platform");
  const iImp   = find("impression");
  const iEng   = find("engagement");
  const iUrl   = find("url", "link", "permalink");
  const iNotes = find("notes", "note");
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return {
      post_name:   iName  !== -1 ? (cols[iName]  ?? "") : "",
      post_date:   iDate  !== -1 ? (cols[iDate]  ?? "") : "",
      platforms:   iPlat  !== -1 ? (cols[iPlat]  ?? "") : "",
      impressions: iImp   !== -1 ? (num(cols[iImp])   ?? 0) : 0,
      engagements: iEng   !== -1 ? (num(cols[iEng])   ?? 0) : 0,
      url:         iUrl   !== -1 ? (cols[iUrl]   ?? "") : "",
      notes:       iNotes !== -1 ? (cols[iNotes] ?? "") : "",
    };
  }).filter(r => r.post_name);
}

// ─── Shared sub-components ───────────────────────────────────────
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

// ─── Tabs ────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",  label: "Overview"  },
  { id: "platforms", label: "Platforms" },
  { id: "topposts",  label: "Top Posts" },
  { id: "allposts",  label: "All Posts" },
  { id: "paidmedia", label: "Paid Media" },
  { id: "insights",  label: "Insights"  },
];

// Throws on Supabase error so callers don't have to destructure every response
const dbOp = async (promise) => {
  const { error } = await promise;
  if (error) throw error;
};

// ─── Main form ───────────────────────────────────────────────────
export function SocialForm({ agency, quarter, onDirtyChange }) {
  const [tab,       setTab]      = useState("overview");
  const [saving,    setSaving]   = useState(false);
  const [saveMsg,   setSaveMsg]  = useState("");
  const [loading,   setLoading]  = useState(true);
  const [loadError, setLoadError] = useState("");

  const [editorsNote, setEditorsNote] = useState("");
  const [kpis,        setKpis]        = useState(BLANK_KPI);
  const [platforms,   setPlatforms]   = useState([]);
  const [topPosts,    setTopPosts]    = useState({ linkedin: [], facebook: [], instagram: [] });
  const [allPosts,    setAllPosts]    = useState([]);
  const [campaigns,   setCampaigns]   = useState([]);
  const [insights,    setInsights]    = useState(BLANK_INSIGHTS);
  const [topTab,      setTopTab]      = useState("linkedin");
  const [postsAsc,    setPostsAsc]    = useState(false);

  // Reorder the All Posts rows by date. Manual, not live, so rows don't jump
  // while a date is being typed; toggles newest-first / oldest-first on each
  // click. ISO "YYYY-MM-DD" strings sort chronologically as plain strings, and
  // undated rows sink to the bottom either way.
  const sortPostsByDate = () => {
    setAllPosts(ps => [...ps].sort((a, b) => {
      const da = a.post_date || "", db = b.post_date || "";
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return postsAsc ? da.localeCompare(db) : db.localeCompare(da);
    }));
    setPostsAsc(a => !a);
    dirty();
  };
  const csvRef   = useRef();
  // Gate that prevents the initial data load from marking the form dirty
  const canDirty = useRef(false);

  const dirty = useCallback(() => {
    if (canDirty.current) onDirtyChange?.(true);
  }, [onDirtyChange]);

  // Load existing data
  useEffect(() => {
    canDirty.current = false;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const { data, error } = await supabase
          .from("social_reports")
          .select("id, editors_note, social_kpis(*), social_platforms(*), social_top_posts(*), social_posts(*), social_insights(*), paid_media_campaigns(*, paid_media_ads(*))")
          .eq("agency", agency)
          .eq("quarter", quarter)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setEditorsNote(data.editors_note || "");
          const k = data.social_kpis?.[0] || {};
          setKpis(Object.fromEntries(KPI_FIELDS.map(f => [f.key, k[f.key] ?? ""])));
          setPlatforms([...(data.social_platforms || [])].sort((a, b) => a.sort_order - b.sort_order).map(p => ({
            name: p.name, followers: str(p.followers), engagement_rate: str(p.engagement_rate),
            page_reach: str(p.page_reach), page_clicks: str(p.page_clicks), note: p.note || "",
          })));
          const tp = { linkedin: [], facebook: [], instagram: [] };
          for (const p of (data.social_top_posts || [])) {
            tp[p.platform]?.push({ title: p.title, impressions: str(p.impressions), likes: str(p.likes), shares: str(p.shares) });
          }
          setTopPosts(tp);
          setAllPosts((data.social_posts || []).map(p => ({
            post_name: p.post_name || "", post_date: p.post_date || "", platforms: p.platforms || "",
            impressions: str(p.impressions), engagements: str(p.engagements), url: p.url || "", notes: p.notes || "",
          })));
          const ins = data.social_insights?.[0] || {};
          setInsights({ working: ins.working || "", not_working: ins.not_working || "", actions: ins.actions || "", next_quarter: ins.next_quarter || "" });
          setCampaigns([...(data.paid_media_campaigns || [])].sort((a, b) => a.sort_order - b.sort_order).map(c => ({
            id: c.id, name: c.name || "",
            ads: [...(c.paid_media_ads || [])].sort((a, b) => a.sort_order - b.sort_order).map(a => ({
              id: a.id, name: a.name || "", impressions: str(a.impressions), clicks: str(a.clicks),
              cpc: str(a.cpc), engagement_rate: str(a.engagement_rate),
            })),
          })));
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
      // Upsert report row
      const { data: rep, error: e1 } = await supabase
        .from("social_reports")
        .upsert({ agency, quarter, editors_note: editorsNote }, { onConflict: "agency,quarter" })
        .select("id").single();
      if (e1) throw e1;
      const rid = rep.id;

      // KPIs
      await dbOp(supabase.from("social_kpis").delete().eq("report_id", rid));
      await dbOp(supabase.from("social_kpis").insert({
        report_id: rid,
        ...Object.fromEntries(KPI_FIELDS.map(f => [f.key, num(kpis[f.key])])),
      }));

      // Platforms
      await dbOp(supabase.from("social_platforms").delete().eq("report_id", rid));
      if (platforms.length) {
        await dbOp(supabase.from("social_platforms").insert(platforms.map((p, i) => ({
          report_id: rid, sort_order: i, name: p.name,
          followers: num(p.followers), engagement_rate: num(p.engagement_rate),
          page_reach: num(p.page_reach), page_clicks: num(p.page_clicks), note: p.note,
        }))));
      }

      // Top posts
      await dbOp(supabase.from("social_top_posts").delete().eq("report_id", rid));
      const allTop = Object.entries(topPosts).flatMap(([plat, posts]) =>
        posts.map(p => ({ report_id: rid, platform: plat, title: p.title, impressions: num(p.impressions), likes: num(p.likes), shares: num(p.shares) }))
      );
      if (allTop.length) await dbOp(supabase.from("social_top_posts").insert(allTop));

      // All posts
      await dbOp(supabase.from("social_posts").delete().eq("report_id", rid));
      if (allPosts.length) {
        await dbOp(supabase.from("social_posts").insert(allPosts.map(p => ({
          report_id: rid, post_name: p.post_name, post_date: p.post_date || null,
          platforms: p.platforms, impressions: num(p.impressions), engagements: num(p.engagements),
          url: p.url, notes: p.notes,
        }))));
      }

      // Paid media (campaign ids are generated client-side so ads can
      // reference their campaign without a round trip to read back inserted ids)
      await dbOp(supabase.from("paid_media_campaigns").delete().eq("report_id", rid));
      if (campaigns.length) {
        await dbOp(supabase.from("paid_media_campaigns").insert(campaigns.map((c, i) => ({
          id: c.id, report_id: rid, sort_order: i, name: c.name,
        }))));
        const ads = campaigns.flatMap(c => c.ads.map((a, j) => ({
          id: a.id, campaign_id: c.id, sort_order: j, name: a.name,
          impressions: num(a.impressions), clicks: num(a.clicks),
          cpc: num(a.cpc), engagement_rate: num(a.engagement_rate),
        })));
        if (ads.length) await dbOp(supabase.from("paid_media_ads").insert(ads));
      }

      // Insights
      await dbOp(supabase.from("social_insights").delete().eq("report_id", rid));
      await dbOp(supabase.from("social_insights").insert({ report_id: rid, ...insights }));

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

  // ── Render ──
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
          <Field label="Editor's Note / Summary">
            <textarea className="admin-textarea" rows={3} value={editorsNote}
              onChange={e => { setEditorsNote(e.target.value); dirty(); }}
              placeholder="Brief summary shown at the top of the report…" />
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

      {/* Platforms */}
      {tab === "platforms" && (
        <div className="admin-form-section">
          <div className="admin-list-hint">Add each social platform — LinkedIn, Facebook, Instagram, etc.</div>
          {platforms.map((p, i) => (
            <div key={i} className="admin-list-row">
              <div className="admin-list-row-grid admin-platform-grid">
                <Field label="Platform name">
                  <select className="admin-input" value={p.name}
                    onChange={e => { setPlatforms(ps => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); dirty(); }}>
                    <option value="">Select…</option>
                    {PLATFORMS_LIST.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Followers">
                  <input type="number" className="admin-input" value={p.followers}
                    onChange={e => { setPlatforms(ps => ps.map((x, j) => j === i ? { ...x, followers: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Engagement Rate (%)">
                  <input type="number" step="0.001" className="admin-input" value={p.engagement_rate}
                    onChange={e => { setPlatforms(ps => ps.map((x, j) => j === i ? { ...x, engagement_rate: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Page Reach">
                  <input type="number" className="admin-input" value={p.page_reach}
                    onChange={e => { setPlatforms(ps => ps.map((x, j) => j === i ? { ...x, page_reach: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Page Clicks">
                  <input type="number" className="admin-input" value={p.page_clicks}
                    onChange={e => { setPlatforms(ps => ps.map((x, j) => j === i ? { ...x, page_clicks: e.target.value } : x)); dirty(); }} />
                </Field>
                <Field label="Note">
                  <input type="text" className="admin-input" value={p.note}
                    onChange={e => { setPlatforms(ps => ps.map((x, j) => j === i ? { ...x, note: e.target.value } : x)); dirty(); }} />
                </Field>
              </div>
              <button className="admin-btn-remove"
                onClick={() => { setPlatforms(ps => ps.filter((_, j) => j !== i)); dirty(); }}
                aria-label="Remove platform"><IconClose /></button>
            </div>
          ))}
          <button className="admin-btn-add"
            onClick={() => { setPlatforms(ps => [...ps, { ...BLANK_PLATFORM }]); dirty(); }}>
            + Add platform
          </button>
        </div>
      )}

      {/* Top Posts */}
      {tab === "topposts" && (
        <div className="admin-form-section">
          <div className="admin-section-tabs admin-section-tabs--sub" role="tablist">
            {TOP_PLATFORMS.map(p => (
              <button key={p} role="tab" aria-selected={topTab === p}
                className={"admin-section-tab" + (topTab === p ? " is-active" : "")}
                onClick={() => setTopTab(p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="admin-list-hint">Top-performing posts for {topTab.charAt(0).toUpperCase() + topTab.slice(1)} this quarter.</div>
          {topPosts[topTab].map((p, i) => (
            <div key={i} className="admin-list-row">
              <div className="admin-list-row-grid admin-toppost-grid">
                <Field label="Post title / headline">
                  <input type="text" className="admin-input" value={p.title}
                    onChange={e => { setTopPosts(tp => ({ ...tp, [topTab]: tp[topTab].map((x, j) => j === i ? { ...x, title: e.target.value } : x) })); dirty(); }} />
                </Field>
                <Field label="Impressions">
                  <input type="number" className="admin-input" value={p.impressions}
                    onChange={e => { setTopPosts(tp => ({ ...tp, [topTab]: tp[topTab].map((x, j) => j === i ? { ...x, impressions: e.target.value } : x) })); dirty(); }} />
                </Field>
                <Field label="Likes / Reactions">
                  <input type="number" className="admin-input" value={p.likes}
                    onChange={e => { setTopPosts(tp => ({ ...tp, [topTab]: tp[topTab].map((x, j) => j === i ? { ...x, likes: e.target.value } : x) })); dirty(); }} />
                </Field>
                <Field label="Shares">
                  <input type="number" className="admin-input" value={p.shares}
                    onChange={e => { setTopPosts(tp => ({ ...tp, [topTab]: tp[topTab].map((x, j) => j === i ? { ...x, shares: e.target.value } : x) })); dirty(); }} />
                </Field>
              </div>
              <button className="admin-btn-remove"
                onClick={() => { setTopPosts(tp => ({ ...tp, [topTab]: tp[topTab].filter((_, j) => j !== i) })); dirty(); }}
                aria-label="Remove post"><IconClose /></button>
            </div>
          ))}
          <button className="admin-btn-add"
            onClick={() => { setTopPosts(tp => ({ ...tp, [topTab]: [...tp[topTab], { ...BLANK_POST }] })); dirty(); }}>
            + Add post
          </button>
        </div>
      )}

      {/* All Posts */}
      {tab === "allposts" && (
        <div className="admin-form-section">
          <div className="admin-allposts-toolbar">
            <div className="admin-list-hint" style={{ marginBottom: 0 }}>
              Full post log for the quarter. Import via CSV or add rows manually.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const rows = parseCsv(ev.target.result);
                    setAllPosts(p => [...p, ...rows]);
                    dirty();
                  };
                  reader.onerror = () => flash("Error: Could not read the CSV file.");
                  reader.readAsText(file);
                  e.target.value = "";
                }} />
              <button className="admin-btn-secondary" onClick={sortPostsByDate} disabled={allPosts.length < 2}>
                Sort by date {postsAsc ? "↑" : "↓"}
              </button>
              <button className="admin-btn-secondary" onClick={() => csvRef.current?.click()}>Import CSV</button>
              <button className="admin-btn-secondary" onClick={() => {
                if (!allPosts.length) return;
                if (window.confirm("Clear all posts? This cannot be undone unless you save first.")) {
                  setAllPosts([]);
                  dirty();
                }
              }}>Clear all</button>
            </div>
          </div>
          <p className="admin-csv-hint">CSV columns: <code>Post Name, Date, Platforms, Impressions, Engagements, URL, Notes</code></p>
          <div className="admin-posts-table-wrap">
            <table className="admin-posts-table">
              <thead>
                <tr>
                  <th>Post name</th><th>Date</th><th>Platforms</th>
                  <th className="r">Impressions</th><th className="r">Engagements</th>
                  <th>URL</th><th>Notes</th><th />
                </tr>
              </thead>
              <tbody>
                {allPosts.map((p, i) => (
                  <tr key={i}>
                    <td><input className="admin-input admin-input--cell" value={p.post_name} onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, post_name: e.target.value } : x)); dirty(); }} /></td>
                    <td><input type="date" className="admin-input admin-input--cell" value={p.post_date} onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, post_date: e.target.value } : x)); dirty(); }} /></td>
                    <td><input className="admin-input admin-input--cell" value={p.platforms} placeholder="LinkedIn, Facebook…" onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, platforms: e.target.value } : x)); dirty(); }} /></td>
                    <td><input type="number" className="admin-input admin-input--cell r" value={p.impressions} onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, impressions: e.target.value } : x)); dirty(); }} /></td>
                    <td><input type="number" className="admin-input admin-input--cell r" value={p.engagements} onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, engagements: e.target.value } : x)); dirty(); }} /></td>
                    <td><input className="admin-input admin-input--cell" value={p.url} placeholder="https://…" onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, url: e.target.value } : x)); dirty(); }} /></td>
                    <td><input className="admin-input admin-input--cell" value={p.notes} onChange={e => { setAllPosts(ps => ps.map((x, j) => j === i ? { ...x, notes: e.target.value } : x)); dirty(); }} /></td>
                    <td><button className="admin-btn-remove" onClick={() => { setAllPosts(ps => ps.filter((_, j) => j !== i)); dirty(); }} aria-label="Remove"><IconClose /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="admin-btn-add" onClick={() => { setAllPosts(ps => [...ps, { ...BLANK_ALL_POST }]); dirty(); }}>+ Add row</button>
          <p className="admin-list-hint" style={{ marginTop: 8 }}>{allPosts.length} post{allPosts.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* Paid Media */}
      {tab === "paidmedia" && (
        <div className="admin-form-section">
          <div className="admin-list-hint">Group ads under a campaign, then add each ad with its metrics.</div>
          {campaigns.map((c, ci) => (
            <div key={c.id} className="admin-campaign-card">
              <div className="admin-campaign-card-head">
                <Field label="Campaign name">
                  <input type="text" className="admin-input" value={c.name}
                    onChange={e => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, name: e.target.value } : x)); dirty(); }} />
                </Field>
                <button className="admin-btn-remove"
                  onClick={() => { setCampaigns(cs => cs.filter((_, j) => j !== ci)); dirty(); }}
                  aria-label="Remove campaign"><IconClose /></button>
              </div>

              {c.ads.map((a, ai) => (
                <div key={a.id} className="admin-list-row">
                  <div className="admin-list-row-grid admin-ad-grid">
                    <Field label="Ad name">
                      <input type="text" className="admin-input" value={a.name}
                        onChange={e => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: x.ads.map((y, k) => k === ai ? { ...y, name: e.target.value } : y) } : x)); dirty(); }} />
                    </Field>
                    <Field label="Impressions">
                      <input type="number" className="admin-input" value={a.impressions}
                        onChange={e => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: x.ads.map((y, k) => k === ai ? { ...y, impressions: e.target.value } : y) } : x)); dirty(); }} />
                    </Field>
                    <Field label="Clicks">
                      <input type="number" className="admin-input" value={a.clicks}
                        onChange={e => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: x.ads.map((y, k) => k === ai ? { ...y, clicks: e.target.value } : y) } : x)); dirty(); }} />
                    </Field>
                    <Field label="CPC ($)">
                      <input type="number" step="0.01" className="admin-input" value={a.cpc}
                        onChange={e => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: x.ads.map((y, k) => k === ai ? { ...y, cpc: e.target.value } : y) } : x)); dirty(); }} />
                    </Field>
                    <Field label="Engagement Rate (%)">
                      <input type="number" step="0.01" className="admin-input" value={a.engagement_rate}
                        onChange={e => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: x.ads.map((y, k) => k === ai ? { ...y, engagement_rate: e.target.value } : y) } : x)); dirty(); }} />
                    </Field>
                  </div>
                  <button className="admin-btn-remove"
                    onClick={() => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: x.ads.filter((_, k) => k !== ai) } : x)); dirty(); }}
                    aria-label="Remove ad"><IconClose /></button>
                </div>
              ))}
              <button className="admin-btn-add"
                onClick={() => { setCampaigns(cs => cs.map((x, j) => j === ci ? { ...x, ads: [...x.ads, newAd()] } : x)); dirty(); }}>
                + Add ad
              </button>
            </div>
          ))}
          <button className="admin-btn-add"
            onClick={() => { setCampaigns(cs => [...cs, newCampaign()]); dirty(); }}>
            + Add campaign
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
