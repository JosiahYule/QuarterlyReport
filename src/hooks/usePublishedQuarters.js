import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { QUARTERS } from "../config.js";

// Which parent table decides whether a view has anything to show.
// Paid Media hangs off a social_reports row rather than a table of its own, so
// the row existing is not the same as the view having data: every quarter has
// a social_reports row, but only some have campaigns under it.
const SOURCES = {
  social: { table: "social_reports", select: "quarter, year" },
  web: { table: "web_reports", select: "quarter, year" },
  paid: { table: "social_reports", select: "quarter, year, paid_media_campaigns(id)" },
};

const hasContent = (view, row) => (view === "paid" ? (row.paid_media_campaigns?.length ?? 0) > 0 : true);

// The quarters in the navigable window that actually have something published
// for this view and agency, most recent first.
//
// Only the empty state asks for this, so it costs a query exactly when the
// page already has nothing to draw. It fails quiet: an error leaves the list
// empty and the caller falls back to the generic "check back soon" wording,
// which is no worse than what it replaced.
export function usePublishedQuarters(view, agency) {
  const [published, setPublished] = useState([]);

  useEffect(() => {
    const source = SOURCES[view];
    if (!source) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.from(source.table).select(source.select).eq("agency", agency);
      if (cancelled || error || !data) return;

      // Matched on suffix AND year: a suffix repeats every fiscal year, and the
      // nav window can straddle two of them.
      const have = new Set(
        data.filter((row) => hasContent(view, row)).map((row) => `${row.quarter}:${row.year}`)
      );
      setPublished(QUARTERS.filter((q) => have.has(`${q.suffix}:${q.year}`)));
    })();

    return () => {
      cancelled = true;
    };
  }, [view, agency]);

  return published;
}
