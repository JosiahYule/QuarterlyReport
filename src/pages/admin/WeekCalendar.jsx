import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { SUGGESTED_CONTENT_TYPES, classifyPost, thisWeekDates, WEEKDAYS, DAY_NAMES } from "../../lib/planEngine.js";
import { IconClose } from "../../components/Icons.jsx";

const STATUSES = [
  { key: "idea",    label: "Idea" },
  { key: "planned", label: "Planned" },
  { key: "posted",  label: "Posted" },
];

const DAY_MS = 86400000;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayIso() {
  return isoFromDate(new Date());
}
function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
// Monday (0=Mon..6=Sun offset) of the calendar week containing `date`.
function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}
function fmtShort(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${MONTH_ABBR[Number(m[2]) - 1]} ${Number(m[3])}`;
}

// A minimal inline "add an idea" box for a day that has no suggestion to
// ghost (past-the-current-week days don't get a fabricated recommendation).
function DayAddBox({ onAdd }) {
  const [value, setValue] = useState("");
  return (
    <input
      className="admin-input admin-cal-addbox"
      placeholder="Add an idea…"
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter" && value.trim()) { onAdd(value.trim()); setValue(""); }
      }}
    />
  );
}

// The weekly calendar planner: a Mon-Fri grid, navigable across the whole
// quarter, that doubles as the interactive editor for `plan_items`. Posted
// and dated-planned days are read from `posts`/the fetched items directly
// (true for any week); the suggested pick per open day only ever comes from
// `week` (buildWeekPlan's output), which is only ever computed for the
// actual current calendar week — other weeks show an open slot to add an
// idea rather than a fabricated recommendation.
export function WeekCalendar({ agency, quarter, posts, week, quarterStart, quarterEnd }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [draft, setDraft]           = useState({ idea: "", content_type: "" });
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("plan_items")
          .select("*")
          .eq("agency", agency)
          .eq("quarter", quarter)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (err) throw err;
        if (!cancelled) setItems(data || []);
      } catch {
        if (!cancelled) setError("Couldn't load your planner. Refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agency, quarter]);

  const flashError = useCallback((msg) => {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }, []);

  const add = useCallback(async (seed = {}) => {
    const idea = (seed.idea ?? draft.idea).trim();
    if (!idea) return;
    const content_type = seed.content_type !== undefined ? seed.content_type : (draft.content_type || null);
    const planned_date = seed.planned_date || null;
    const tempId = `tmp-${Date.now()}`;
    const row = {
      id: tempId, agency, quarter, idea, content_type: content_type || null, planned_date,
      status: "idea", sort_order: items.length, created_at: new Date().toISOString(),
    };
    setItems(x => [...x, row]);
    setDraft({ idea: "", content_type: "" });
    try {
      const { data, error: err } = await supabase
        .from("plan_items")
        .insert({ agency, quarter, idea, content_type: row.content_type, planned_date: row.planned_date, status: "idea", sort_order: row.sort_order })
        .select().single();
      if (err) throw err;
      setItems(x => x.map(i => (i.id === tempId ? data : i)));
    } catch {
      setItems(x => x.filter(i => i.id !== tempId));
      flashError("Couldn't save that idea. Check your connection and try again.");
    }
  }, [draft, agency, quarter, items.length, flashError]);

  // Local-only edit (no write) — used for text fields while typing.
  const editLocal = useCallback((id, fields) => {
    setItems(x => x.map(i => (i.id === id ? { ...i, ...fields } : i)));
  }, []);

  // Persist fields for one row. Skips temp rows that haven't landed yet.
  const save = useCallback(async (id, fields) => {
    if (String(id).startsWith("tmp-")) return;
    try {
      const { error: err } = await supabase
        .from("plan_items")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) throw err;
    } catch {
      flashError("Couldn't save your change.");
    }
  }, [flashError]);

  // Immediate edit + write, for selects / dates / status.
  const patch = useCallback((id, fields) => {
    editLocal(id, fields);
    save(id, fields);
  }, [editLocal, save]);

  const remove = useCallback(async (id) => {
    const prev = items;
    setItems(x => x.filter(i => i.id !== id));
    if (String(id).startsWith("tmp-")) return;
    try {
      const { error: err } = await supabase.from("plan_items").delete().eq("id", id);
      if (err) throw err;
    } catch {
      setItems(prev);
      flashError("Couldn't delete that item.");
    }
  }, [items, flashError]);

  // ─── Week navigation, bounded to the quarter ───────────────────────
  const thisMonday = mondayOf(new Date());
  const displayedMonday = addDays(thisMonday, weekOffset * 7);
  const weekDates = thisWeekDates(displayedMonday);
  const today = todayIso();

  const minOffset = quarterStart ? Math.round((mondayOf(quarterStart) - thisMonday) / (7 * DAY_MS)) : -52;
  const maxOffset = quarterEnd ? Math.round((mondayOf(addDays(quarterEnd, -1)) - thisMonday) / (7 * DAY_MS)) : 52;

  const backlog = items.filter(i => !i.planned_date);
  const openCount = items.filter(i => i.status !== "posted").length;

  return (
    <div>
      <div className="admin-section-heading">Weekly planner</div>
      <p className="admin-list-hint">
        {openCount > 0 ? `${openCount} open item${openCount === 1 ? "" : "s"} this quarter.` : "Nothing queued yet."}
      </p>

      <div className="admin-cal-nav">
        <button className="admin-btn-ghost" onClick={() => setWeekOffset(o => o - 1)} disabled={weekOffset <= minOffset} aria-label="Previous week">‹</button>
        <span className="admin-cal-range">{fmtShort(weekDates[1])} – {fmtShort(weekDates[5])}</span>
        {weekOffset !== 0 && <button className="admin-btn-ghost admin-cal-today" onClick={() => setWeekOffset(0)}>Today</button>}
        <button className="admin-btn-ghost" onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= maxOffset} aria-label="Next week">›</button>
      </div>

      {error && <div className="admin-form-status admin-form-status--error" style={{ marginTop: 12 }}>{error}</div>}

      {loading ? (
        <div className="admin-form-status">Loading your planner…</div>
      ) : (
        <div className="admin-cal-grid">
          {WEEKDAYS.map(dayIndex => {
            const dateStr = weekDates[dayIndex];
            const postedPosts = (posts || []).filter(p => p.post_date === dateStr);
            const dayItems = items.filter(i => i.planned_date === dateStr);
            const suggestion = weekOffset === 0 ? (week || []).find(d => d.dayIndex === dayIndex) : null;
            const hasSuggestion = suggestion && (suggestion.slot === "job" || suggestion.slot === "content");
            const isPast = dateStr < today;
            const isToday = dateStr === today;
            const isEmpty = postedPosts.length === 0 && dayItems.length === 0;

            return (
              <div key={dayIndex} className={"admin-cal-day" + (isToday ? " is-today" : "") + (isEmpty && isPast ? " is-missed" : "")}>
                <div className="admin-cal-day-head">
                  <span className="admin-cal-day-name">{DAY_NAMES[dayIndex]}</span>
                  <span className="admin-cal-day-date">{fmtShort(dateStr)}</span>
                  {isToday && <span className="admin-plan-today-tag">Today</span>}
                </div>

                {postedPosts.map((p, i) => (
                  <div className="admin-cal-posted" key={i}>
                    <span className="admin-plan-postedtag">Posted</span> {classifyPost(p).label}
                    {p.post_name ? ` — ${p.post_name}` : ""}
                  </div>
                ))}

                {dayItems.map(item => (
                  <div key={item.id} className={"admin-cal-item" + (item.status === "posted" ? " is-posted" : "")}>
                    <input
                      className="admin-input admin-cal-item-idea"
                      value={item.idea}
                      onChange={e => editLocal(item.id, { idea: e.target.value })}
                      onBlur={e => save(item.id, { idea: e.target.value })}
                    />
                    <div className="admin-cal-item-row">
                      <select className="admin-input" value={item.content_type || ""}
                        onChange={e => patch(item.id, { content_type: e.target.value || null })}>
                        <option value="">Type…</option>
                        {SUGGESTED_CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select className="admin-input" value={item.status}
                        onChange={e => patch(item.id, { status: e.target.value })}>
                        {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <button className="admin-btn-remove" onClick={() => remove(item.id)} aria-label="Remove item"><IconClose /></button>
                    </div>
                  </div>
                ))}

                {isEmpty && (
                  hasSuggestion ? (
                    <div className="admin-cal-suggestion">
                      <span className="admin-cal-ghost">
                        {suggestion.slot === "job" ? `${suggestion.roleLabel} job ad` : (suggestion.bestType?.label || "Mix it up — any fresh content")}
                      </span>
                      {suggestion.recommendBoost && <span className="admin-plan-flag is-opp">Boost this</span>}
                      <button
                        className="admin-btn-secondary admin-cal-add"
                        onClick={() => add({
                          idea: suggestion.slot === "job"
                            ? `${suggestion.roleLabel} job ad for ${DAY_NAMES[dayIndex]}`
                            : `${suggestion.bestType?.label || "Post"} for ${DAY_NAMES[dayIndex]}`,
                          content_type: suggestion.bestType?.label || null,
                          planned_date: dateStr,
                        })}
                      >
                        + Add
                      </button>
                    </div>
                  ) : isPast ? (
                    <div className="admin-plan-nodata">No post logged</div>
                  ) : (
                    <DayAddBox onAdd={idea => add({ idea, planned_date: dateStr })} />
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="admin-cal-backlog">
        <div className="admin-section-heading">Backlog</div>
        <p className="admin-list-hint">Ideas without a date yet — schedule one to move it onto the calendar.</p>

        <div className="admin-planner-add">
          <input
            className="admin-input"
            placeholder="New post idea…"
            value={draft.idea}
            onChange={e => setDraft(d => ({ ...d, idea: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") add(); }}
          />
          <select className="admin-input" value={draft.content_type}
            onChange={e => setDraft(d => ({ ...d, content_type: e.target.value }))}>
            <option value="">Type…</option>
            {SUGGESTED_CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="admin-btn-primary" onClick={() => add()} disabled={!draft.idea.trim()}>Add</button>
        </div>

        {backlog.length === 0 ? (
          <div className="admin-plan-empty">No backlog ideas. Add one above, or add directly to a day in the calendar.</div>
        ) : (
          <ul className="admin-planner-list">
            {backlog.map(item => (
              <li key={item.id} className={"admin-planner-row is-" + item.status}>
                <select className="admin-input admin-planner-status" value={item.status}
                  onChange={e => patch(item.id, { status: e.target.value })}>
                  {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <input
                  className="admin-input admin-planner-idea"
                  value={item.idea}
                  onChange={e => editLocal(item.id, { idea: e.target.value })}
                  onBlur={e => save(item.id, { idea: e.target.value })}
                />
                <select className="admin-input admin-planner-type" value={item.content_type || ""}
                  onChange={e => patch(item.id, { content_type: e.target.value || null })}>
                  <option value="">Type…</option>
                  {SUGGESTED_CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" className="admin-input admin-planner-date" value=""
                  onChange={e => e.target.value && patch(item.id, { planned_date: e.target.value })} />
                <button className="admin-btn-remove" onClick={() => remove(item.id)} aria-label="Remove item"><IconClose /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
