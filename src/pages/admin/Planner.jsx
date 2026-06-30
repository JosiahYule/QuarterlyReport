import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { SUGGESTED_CONTENT_TYPES } from "../../lib/planEngine.js";
import { IconClose } from "../../components/Icons.jsx";

const STATUSES = [
  { key: "idea",    label: "Idea" },
  { key: "planned", label: "Planned" },
  { key: "posted",  label: "Posted" },
];

const BLANK_DRAFT = { idea: "", content_type: "", planned_date: "" };

// Today's calendar date as YYYY-MM-DD, for pre-filling the planner.
function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Upcoming/active work first, posted items sunk to the bottom; within each
// group, dated items sort earliest-first so the next thing to do is on top.
function sortItems(items) {
  return [...items].sort((a, b) => {
    const ap = a.status === "posted" ? 1 : 0;
    const bp = b.status === "posted" ? 1 : 0;
    if (ap !== bp) return ap - bp;
    const ad = a.planned_date || "9999-12-31";
    const bd = b.planned_date || "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

export function Planner({ agency, quarter, suggestion }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [draft, setDraft]     = useState(BLANK_DRAFT);

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
    const merged = { ...draft, ...seed };
    const idea = merged.idea.trim();
    if (!idea) return;
    const tempId = `tmp-${Date.now()}`;
    const row = {
      id: tempId, agency, quarter, idea,
      content_type: merged.content_type || null,
      planned_date: merged.planned_date || null,
      status: "idea", sort_order: items.length, created_at: new Date().toISOString(),
    };
    setItems(x => [...x, row]);
    setDraft(BLANK_DRAFT);
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

  const sorted = sortItems(items);
  const openCount = items.filter(i => i.status !== "posted").length;

  return (
    <div>
      <div className="admin-section-heading">Post planner</div>
      <p className="admin-list-hint">
        Capture ideas, schedule them, and check them off as you post. {openCount > 0
          ? `${openCount} open item${openCount === 1 ? "" : "s"}.`
          : "Nothing queued yet."}
      </p>

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
        <input type="date" className="admin-input" value={draft.planned_date}
          onChange={e => setDraft(d => ({ ...d, planned_date: e.target.value }))} />
        <button className="admin-btn-primary" onClick={() => add()} disabled={!draft.idea.trim()}>Add</button>
      </div>

      {suggestion?.type && (
        <button
          className="admin-btn-secondary admin-planner-quickadd"
          onClick={() => add({ idea: `${suggestion.type} for ${suggestion.todayName}`, content_type: suggestion.type, planned_date: todayIso() })}
        >
          + Add today's pick: {suggestion.type}
        </button>
      )}

      {error && <div className="admin-form-status admin-form-status--error" style={{ marginTop: 12 }}>{error}</div>}

      {loading ? (
        <div className="admin-form-status">Loading your planner…</div>
      ) : sorted.length === 0 ? (
        <div className="admin-plan-empty">No items yet. Add an idea above to start planning your quarter.</div>
      ) : (
        <ul className="admin-planner-list">
          {sorted.map(item => (
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
              <input type="date" className="admin-input admin-planner-date" value={item.planned_date || ""}
                onChange={e => patch(item.id, { planned_date: e.target.value || null })} />
              <button className="admin-btn-remove" onClick={() => remove(item.id)} aria-label="Remove item"><IconClose /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
