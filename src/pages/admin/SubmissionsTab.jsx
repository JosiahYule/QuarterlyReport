import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { normalizeSubmissions } from "../../lib/formSubmissions.js";
import {
  halifaxToday,
  daysAgo,
  shortWhen,
  fullWhen,
  city,
  countByEmail,
  toCsv,
} from "../../lib/submissionsView.js";

const PAGE = 50;
const FETCH_PAGE = 1000;

const VIEWS = [
  { id: "all", label: "All" },
  { id: "staff", label: "Employer leads" },
  { id: "work", label: "Job seekers" },
];

const PERIODS = [
  { id: "all", label: "Any time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
];

// The newest submission this browser has seen, per agency, so rows that
// arrived since the last visit can be marked. Storage can be blocked (private
// windows, strict settings); the tab then simply shows no "new" marks.
const seenKey = (agency) => `submissions:lastSeen:${agency}`;
function readSeen(agency) {
  try {
    return window.localStorage.getItem(seenKey(agency));
  } catch {
    return null;
  }
}
function writeSeen(agency, ts) {
  try {
    if (ts) window.localStorage.setItem(seenKey(agency), ts);
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked: the address is still selectable */
    }
  };
  return (
    <button type="button" className="sub-copy" onClick={copy}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Detail({ r, others, onShowAllFrom }) {
  return (
    <div className="sub-detail" id={`sub-${r.id}`}>
      <div className="sub-detail-body">
        {r.comments ? (
          <p className="sub-detail-comment">{r.comments}</p>
        ) : (
          <p className="sub-detail-empty">No comment left.</p>
        )}
      </div>
      <dl className="sub-detail-meta">
        {r.email && (
          <>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${r.email}`}>{r.email}</a> <CopyButton text={r.email} />
            </dd>
          </>
        )}
        {r.phone && (
          <>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a>
            </dd>
          </>
        )}
        {r.location && (
          <>
            <dt>Branch</dt>
            <dd>{r.location}</dd>
          </>
        )}
        {r.source && (
          <>
            <dt>Heard via</dt>
            <dd>
              {r.source}
              {r.source_detail && <span className="sub-muted"> · {r.source_detail}</span>}
            </dd>
          </>
        )}
        <dt>Received</dt>
        <dd>{fullWhen(r.submitted_at)}</dd>
        {r.document_url && (
          <>
            <dt>Resume</dt>
            <dd>
              <a href={r.document_url} target="_blank" rel="noopener noreferrer">
                Open file ↗
              </a>
            </dd>
          </>
        )}
        {others > 1 && (
          <>
            <dt>History</dt>
            <dd>
              {others} submissions from this email.{" "}
              <button type="button" className="sub-link" onClick={() => onShowAllFrom(r.email)}>
                Show all
              </button>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function SubmissionsTab({ agency }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [period, setPeriod] = useState("all");
  const [fLocation, setFLocation] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [shown, setShown] = useState(PAGE);
  // Read once per mount: what the newest submission was on the last visit.
  const [seenBefore] = useState(() => readSeen(agency));
  const csvRef = useRef();
  const today = useMemo(() => halifaxToday(), []);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 6000);
  };

  // Supabase answers any one request with at most 1,000 rows, so a single
  // select would quietly stop at the newest 1,000 submissions, and the import
  // summary, which counts rows before and after, would report nothing new.
  // Read it in pages instead; `id` breaks timestamp ties so no row lands on
  // two pages or on none.
  const load = useCallback(async () => {
    const all = [];
    for (let from = 0; ; from += FETCH_PAGE) {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("agency", agency)
        .order("submitted_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + FETCH_PAGE - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < FETCH_PAGE) break;
    }
    setRows(all);
    // Remember the newest row for next time. This visit keeps using
    // `seenBefore`, so the "new" marks stay put until the tab is reopened.
    writeSeen(agency, all[0]?.submitted_at);
    return all;
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
        flash("Error: No submissions found in that file. Is it the contact form export?");
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
      flash(
        `Imported ${parsed.length} rows: ${added} new, ${parsed.length - added} already here` +
          (skipped ? `, ${skipped} malformed skipped` : "") +
          "."
      );
    } catch (err) {
      flash("Error: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const perEmail = useMemo(() => countByEmail(rows), [rows]);
  const locations = useMemo(() => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(), [rows]);
  const sources = useMemo(() => [...new Set(rows.map((r) => r.source).filter(Boolean))].sort(), [rows]);
  const isNew = (r) => seenBefore != null && r.submitted_at > seenBefore;
  const newCount = useMemo(
    () => (seenBefore == null ? 0 : rows.filter((r) => r.submitted_at > seenBefore).length),
    [rows, seenBefore]
  );

  // Every filter except the view switch. The switch's counts come from this,
  // so "Employer leads 4" means four leads within the other filters.
  const narrowed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const maxDays = period === "all" ? null : Number(period);
    return rows.filter((r) => {
      if (fLocation !== "all" && r.location !== fLocation) return false;
      if (fSource !== "all" && r.source !== fSource) return false;
      if (maxDays != null) {
        const ago = daysAgo(r.submitted_at, today);
        if (ago == null || ago >= maxDays) return false;
      }
      if (!q) return true;
      return [r.name, r.email, r.phone, r.location, r.comments, r.source_detail].some(
        (v) => v && v.toLowerCase().includes(q)
      );
    });
  }, [rows, search, period, fLocation, fSource, today]);

  const counts = useMemo(
    () => ({
      all: narrowed.length,
      staff: narrowed.filter((r) => r.intent === "staff").length,
      work: narrowed.filter((r) => r.intent === "work").length,
    }),
    [narrowed]
  );

  const visible = useMemo(
    () => (view === "all" ? narrowed : narrowed.filter((r) => r.intent === view)),
    [narrowed, view]
  );

  // New filter or search: start back at the first page of results
  useEffect(() => {
    setShown(PAGE);
  }, [search, view, period, fLocation, fSource]);

  const filtersOn = search || period !== "all" || fLocation !== "all" || fSource !== "all";
  const clearFilters = () => {
    setSearch("");
    setPeriod("all");
    setFLocation("all");
    setFSource("all");
  };

  const showAllFrom = (email) => {
    clearFilters();
    setView("all");
    setSearch(email);
  };

  const exportCsv = () => {
    const label = { all: "all", staff: "employer-leads", work: "job-seekers" }[view];
    download(`submissions-${agency}-${label}-${today}.csv`, toCsv(visible));
  };

  if (loading) return <div className="admin-form-status">Loading submissions…</div>;
  if (loadError) return <div className="admin-form-status admin-form-status--error">{loadError}</div>;

  return (
    <div className="sub">
      <div className="sub-head">
        <p className="sub-summary">
          {rows.length.toLocaleString("en-CA")} submissions
          {rows[0] && (
            <>
              {" "}
              · latest{" "}
              {shortWhen(rows[0].submitted_at, today).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())}
            </>
          )}
          {newCount > 0 && (
            <span className="sub-summary-new">
              {" "}
              · <span className="sub-dot" aria-hidden="true" />
              {newCount} new since your last visit
            </span>
          )}
        </p>
        <div className="sub-head-actions">
          {msg && (
            <span className={"admin-save-msg" + (msg.startsWith("Error") ? " is-error" : "")}>{msg}</span>
          )}
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={exportCsv}
            disabled={!visible.length}
            title="Download the submissions currently shown, as a spreadsheet"
          >
            Export {visible.length.toLocaleString("en-CA")}
          </button>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsv(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => csvRef.current?.click()}
            disabled={importing}
            title="Import the website form's CSV export. Overlapping exports only add what's new."
          >
            {importing ? "Importing…" : "Import CSV"}
          </button>
        </div>
      </div>

      <div className="sub-controls">
        <div className="sub-views" role="tablist" aria-label="Submission type">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={"sub-view" + (view === v.id ? " is-active" : "")}
              onClick={() => setView(v.id)}
            >
              {v.label} <span className="sub-view-count">{counts[v.id].toLocaleString("en-CA")}</span>
            </button>
          ))}
        </div>
        <input
          className="admin-input sub-search"
          type="search"
          placeholder="Search"
          aria-label="Search names, emails, phones and comments"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-input sub-select"
          aria-label="Time period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="admin-input sub-select"
          aria-label="Branch"
          value={fLocation}
          onChange={(e) => setFLocation(e.target.value)}
        >
          <option value="all">Any branch</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {city(l)}
            </option>
          ))}
        </select>
        <select
          className="admin-input sub-select"
          aria-label="How they heard about us"
          value={fSource}
          onChange={(e) => setFSource(e.target.value)}
        >
          <option value="all">Any source</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <ul className="sub-list">
        {visible.slice(0, shown).map((r) => {
          const open = expanded === r.id;
          const times = perEmail.get(r.email) || 0;
          return (
            <li key={r.id} className={"sub-item" + (open ? " is-open" : "")}>
              <button
                type="button"
                className="sub-row"
                aria-expanded={open}
                aria-controls={open ? `sub-${r.id}` : undefined}
                onClick={() => setExpanded(open ? null : r.id)}
              >
                <span className="sub-mark">
                  {isNew(r) && <span className="sub-dot" title="New since your last visit" />}
                </span>
                <span className="sub-main">
                  <span className="sub-line">
                    <span className="sub-name">{r.name || r.email || "No name"}</span>
                    {r.intent === "staff" && <span className="sub-tag">Employer</span>}
                    {times > 1 && (
                      <span className="sub-repeat" title={`${times} submissions from this email`}>
                        ×{times}
                      </span>
                    )}
                  </span>
                  {r.comments && <span className="sub-preview">{r.comments}</span>}
                </span>
                <span className="sub-where">{city(r.location)}</span>
                <span className="sub-when" title={fullWhen(r.submitted_at)}>
                  {shortWhen(r.submitted_at, today)}
                </span>
              </button>
              {open && <Detail r={r} others={times} onShowAllFrom={showAllFrom} />}
            </li>
          );
        })}
      </ul>

      {!visible.length && (
        <div className="sub-empty">
          Nothing matches these filters.{" "}
          {filtersOn && (
            <button type="button" className="sub-link" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {visible.length > shown && (
        <div className="sub-more">
          <button type="button" className="admin-btn-ghost" onClick={() => setShown((s) => s + 2 * PAGE)}>
            Show more
          </button>
          <span className="sub-muted">
            {shown.toLocaleString("en-CA")} of {visible.length.toLocaleString("en-CA")}
          </span>
        </div>
      )}
    </div>
  );
}
