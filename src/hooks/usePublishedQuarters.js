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

// The quarters in the navigable window that have something published for this
// view and agency, most recent first.
//
// Returns null until the answer is known, and an array once it is — including
// an empty array. Callers need that difference: "not asked yet" is a reason to
// wait before choosing a quarter, "asked, none" is not, and conflating them
// would leave the app waiting forever on a view with no data.
//
// It fails settled rather than silent: an error resolves to [], so a failed
// lookup degrades to the old behaviour instead of blocking the page.
export function usePublishedQuarters(view, agency) {
  const [published, setPublished] = useState(null);

  useEffect(() => {
    const source = SOURCES[view];
    // Trends spans quarters and has no per-quarter data to find.
    if (!source) {
      setPublished([]);
      return;
    }

    let cancelled = false;
    setPublished(null);

    (async () => {
      const { data, error } = await supabase.from(source.table).select(source.select).eq("agency", agency);
      if (cancelled) return;
      if (error || !data) {
        setPublished([]);
        return;
      }
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

// Which quarter a page should actually open on, or null to stay put.
//
// Split out from the component because it is the whole of the decision and
// every branch of it is a rule worth pinning down:
//
//   explicit quarter  -> null. Chosen from the menu or shared in a link; an
//                        answer, not a guess, and not ours to overrule.
//   still loading     -> null. Nothing is known yet; asking again once it is.
//   nothing published -> null. No better quarter exists, so the empty state
//                        does the explaining.
//   current has data  -> null. Already the right place.
//   otherwise         -> the newest quarter that has a report.
export function resolveLandingQuarter({ quarter, quarterExplicit, published }) {
  if (quarterExplicit) return null;
  if (published === null || published.length === 0) return null;
  if (published.some((q) => q.suffix === quarter)) return null;
  return published[0].suffix;
}
