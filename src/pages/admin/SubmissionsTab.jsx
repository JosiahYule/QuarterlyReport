import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { normalizeSubmissions } from "../../lib/formSubmissions.js";

const INTENT_LABELS = { work: "Job seeker", staff: "Employer lead", unknown: "—" };
const PAGE = 50;

// Timestamps are stored as Halifax wall-clock strings; format them without
// constructing a timezone-aware Date so every viewer sees the form's time.
function fmtWhen(ts) {
  const [d, t] = String(ts || "").split(/[T ]/);
  if (!d || !t) return ts || "—";
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm).toLocaleString("en-CA", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function IntentBadge({ intent }) {
  if (intent === "unknown") return <span>—</span>;
  return (
    <span className={"admin-sub-intent" + (intent === "staff" ? " is-staff" : "")}>
      {INTENT_LABELS[intent]}
    </span>
  );
}

function LeadSpotlight({ leads, onShowAll }) {
  if (!leads.length) return null;
  return (
    <div className="admin-lead-block">
      <div className="admin-section-heading">Employer leads — {leads.length} total</div>
      <div className="admin-list-hint">
        Businesses looking for staff. The most recent {Math.min(leads.length, 6)} shown; these are the rows worth a same-day call back.
      </div>
      <div className="admin-lead-grid">
        {leads.slice(0, 6).map(l => (
          <div className="admin-lead-card" key={l.id}>
            <div className="admin-lead-card-top">
              <span className="admin-lead-name">{l.name || "—"}</span>
              <span className="admin-lead-date">{fmtWhen(l.submitted_at)}</span>
            </div>
            <div className="admin-lead-contact">
              {l.email && <a href={`mailto:${l.email}`}>{l.email}</a>}
              {l.phone && <span>{l.phone}</span>}
              {l.location && <span>{l.location}</span>}
            </div>
            {l.comments && <p className="admin-lead-comment">{l.comments}</p>}
          </div>
        ))}
      </div>
      {leads.length > 6 && (
        <button className="admin-btn-secondary" onClick={onShowAll}>
          Show all {leads.length} employer leads in the table
        </button>
      )}
    </div>
  );
}

export function SubmissionsTab({ agency }) {
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg,       setMsg]       = useState("");
  const [search,    setSearch]    = useState("");
  const [fIntent,   setFIntent]   = useState("all");
  const [fLocation, setFLocation] = useState("all");
  const [fSource,   setFSource]   = useState("all");
  const [expanded,  setExpanded]  = useState(null);
  const [shown,     setShown]     = useState(PAGE);
  const csvRef  = useRef();
  const tableRef = useRef();

  const flash = msg => { setMsg(msg); setTimeout(() => setMsg(""), 6000); };

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("form_submissions")
      .select("*")
      .eq("agency", agency)
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    setRows(data || []);
    return data || [];
  }, [agency]);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    load()
      .catch(() => setLoadError("Failed to load submissions. Please refresh and try again."))
      .finally(() => setLoading(false));
  }, [load]);

  const importCsv = async (file) => {
    setImporting(true);
    setMsg("");
    try {
      const text = await file.text();
      const { rows: parsed, skipped } = normalizeSubmissions(text, agency);
      if (!parsed.length) {
        flash("Error: No submissions found in that file — is it the contact form export?");
        return;
      }
      const before = rows.length;
      // Merge on the dedupe key so re-importing overlapping exports is safe
      // and re-imports pick up any parsing improvements.
      for (let i = 0; i < parsed.length; i += 200) {
        const { error } = await supabase
          .from("form_submissions")
          .upsert(parsed.slice(i, i + 200), { onConflict: "agency,submitted_at,email" });
        if (error) throw error;
      }
      const after = await load();
      const added = after.length - before;
      flash(`Imported ${parsed.length} rows — ${added} new, ${parsed.length - added} already present`
        + (skipped ? `, ${skipped} malformed skipped` : "") + ".");
    } catch (err) {
      flash("Error: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const leads = useMemo(() => rows.filter(r => r.intent === "staff"), [rows]);
  const locations = useMemo(() => [...new Set(rows.map(r => r.location).filter(Boolean))].sort(), [rows]);
  const sources   = useMemo(() => [...new Set(rows.map(r => r.source).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (fIntent === "all"   || r.intent === fIntent) &&
      (fLocation === "all" || r.location === fLocation) &&
      (fSource === "all"   || r.source === fSource) &&
      (!q || [r.name, r.email, r.phone, r.comments, r.source_detail]
        .some(v => v && v.toLowerCase().includes(q)))
    );
  }, [rows, search, fIntent, fLocation, fSource]);

  // New filter/search → start back at the first page of results
  useEffect(() => { setShown(PAGE); }, [search, fIntent, fLocation, fSource]);

  const showAllLeads = () => {
    setFIntent("staff");
    setSearch("");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading)   return <div className="admin-form-status">Loading submissions…</div>;
  if (loadError) return <div className="admin-form-status admin-form-status--error">{loadError}</div>;

  return (
    <div className="admin-form">
      <div className="admin-allposts-toolbar">
        <div className="admin-list-hint" style={{ marginBottom: 0 }}>
          Contact form submissions — {rows.length} on record. Import the form's CSV export;
          re-importing overlapping exports only adds what's new.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {msg && <span className={"admin-save-msg" + (msg.startsWith("Error") ? " is-error" : "")}>{msg}</span>}
          <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) importCsv(file);
              e.target.value = "";
            }} />
          <button className="admin-btn-primary" onClick={() => csvRef.current?.click()} disabled={importing}>
            {importing ? "Importing…" : "Import CSV"}
          </button>
        </div>
      </div>

      <LeadSpotlight leads={leads} onShowAll={showAllLeads} />

      <div className="admin-sub-filters" ref={tableRef}>
        <input className="admin-input admin-sub-search" type="search" placeholder="Search name, email, phone, comments…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="admin-input" value={fIntent} onChange={e => setFIntent(e.target.value)}>
          <option value="all">All intents</option>
          <option value="work">Job seekers</option>
          <option value="staff">Employer leads</option>
          <option value="unknown">Unknown</option>
        </select>
        <select className="admin-input" value={fLocation} onChange={e => setFLocation(e.target.value)}>
          <option value="all">All locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="admin-input" value={fSource} onChange={e => setFSource(e.target.value)}>
          <option value="all">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="admin-list-hint" style={{ marginBottom: 0 }}>
          {filtered.length === rows.length ? `${rows.length} submissions` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="admin-posts-table-wrap">
        <table className="admin-posts-table">
          <thead>
            <tr>
              <th>Date</th><th>Name</th><th>Contact</th><th>Location</th>
              <th>Intent</th><th>Source</th><th>Resume</th><th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map(r => {
              const hasMore = r.comments || r.source_detail;
              const isOpen = expanded === r.id;
              return (
                <React.Fragment key={r.id}>
                  <tr className={hasMore ? "admin-sub-row--expandable" : ""}
                    onClick={() => hasMore && setExpanded(isOpen ? null : r.id)}>
                    <td className="admin-sub-nowrap">{fmtWhen(r.submitted_at)}</td>
                    <td>{r.name || "—"}</td>
                    <td>
                      <div className="admin-sub-contact">
                        {r.email && <a href={`mailto:${r.email}`} onClick={e => e.stopPropagation()}>{r.email}</a>}
                        {r.phone && <span>{r.phone}</span>}
                      </div>
                    </td>
                    <td className="admin-sub-nowrap">{r.location || "—"}</td>
                    <td><IntentBadge intent={r.intent} /></td>
                    <td>{r.source || "—"}</td>
                    <td>
                      {r.document_url && (
                        <a href={r.document_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}>Resume&nbsp;↗</a>
                      )}
                    </td>
                    <td className="admin-sub-caret">{hasMore ? (isOpen ? "▾" : "▸") : ""}</td>
                  </tr>
                  {isOpen && (
                    <tr className="admin-sub-detail">
                      <td colSpan={8}>
                        {r.source_detail && <p><strong>Source detail:</strong> {r.source_detail}</p>}
                        {r.comments && <p className="admin-sub-comment-text">{r.comments}</p>}
                        <p className="admin-csv-hint" style={{ margin: 0 }}>
                          Marketing opt-in: {r.accepts_marketing ? "yes" : "no"}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={8} className="admin-sub-empty">No submissions match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > shown && (
        <button className="admin-btn-add" onClick={() => setShown(s => s + 2 * PAGE)}>
          Show more ({filtered.length - shown} remaining)
        </button>
      )}
    </div>
  );
}
