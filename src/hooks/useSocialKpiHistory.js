import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { QUARTERS, resolveQuarter } from "../config.js";
import { oneRow } from "../lib/fetching.js";
import { socialKpis } from "./useSocialReport.js";

// KPI totals for the selected quarter and up to three before it, oldest first,
// for the quarter-by-quarter chart. Anchored on the selected quarter rather
// than today's, so an older report charts its own history and never the
// quarters that came after it.
export function useSocialKpiHistory(agency, quarter) {
  const [history, setHistory] = useState(null);
  const q = resolveQuarter(quarter);

  useEffect(() => {
    let cancelled = false;
    const at = QUARTERS.indexOf(q);
    const span = QUARTERS.slice(at, at + 4).reverse();
    (async () => {
      try {
        const { data, error } = await supabase
          .from("social_reports")
          .select("quarter, year, social_kpis(*)")
          .eq("agency", agency)
          .or(span.map((w) => `and(quarter.eq.${w.suffix},year.eq.${w.year})`).join(","));
        if (error) throw error;
        if (!cancelled) {
          const byQuarter = {};
          (data || []).forEach((r) => {
            byQuarter[`${r.quarter}-${r.year}`] = socialKpis(oneRow(r.social_kpis));
          });
          setHistory(
            span.map((w) => ({
              id: w.id,
              label: w.label,
              rangeLabel: w.rangeLabel,
              kpis: byQuarter[`${w.suffix}-${w.year}`] || null,
            }))
          );
        }
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agency, q]);

  return history;
}
