import React from "react";
import { EmptyNote } from "./EmptyState.jsx";

// The four insight fields, in the order the admin form presents them.
const FIELDS = [
  { key: "working", label: "Working", cls: "working" },
  { key: "notWorking", label: "Not working", cls: "notworking" },
  { key: "actions", label: "Actions", cls: "" },
  { key: "next", label: "Next quarter", cls: "" },
];

// One newline starts a new point. Social and Web used to disagree about this
// — Social split on any newline, Web only on a blank line — so the same text
// typed into the same admin field rendered as two bullets on one report and
// one run-on bullet on the other. Splitting on any run of newlines is the
// forgiving reading: pressing Enter does what it looks like it does, and
// leaving a blank line still works.
export function toPoints(value) {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .filter((v) => typeof v === "string")
    .flatMap((v) => v.split(/\n+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function InsightsSection({ insights }) {
  const src = insights || {};
  return (
    <section id="insights" className="section wrap">
      <header className="section-head">
        <h2 className="section-title serif">
          <em>Insights</em>
        </h2>
      </header>
      <div className="notes">
        {FIELDS.map((f) => {
          const points = toPoints(src[f.key]);
          return (
            <div className={("note " + f.cls).trim()} key={f.key}>
              <h4>{f.label}</h4>
              {points.length ? (
                <ul>
                  {points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              ) : (
                <EmptyNote />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
