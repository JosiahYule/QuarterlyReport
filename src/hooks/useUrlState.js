import { useState, useCallback, useEffect } from "react";
import { AGENCIES, VIEWS, CURRENT_QUARTER, quarterFromId } from "../config.js";

const DEFAULTS = { agency: "isl", quarter: CURRENT_QUARTER.id, view: "social" };

// The three params that belong in the URL. State carries one more field than
// this (quarterExplicit), and writing that to the query string would put an
// implementation detail in every link anyone copies.
const PARAMS = ["agency", "quarter", "view"];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const agency = AGENCIES[p.get("agency")] ? p.get("agency") : DEFAULTS.agency;
  const view = VIEWS.includes(p.get("view")) ? p.get("view") : DEFAULTS.view;
  const urlQuarter = quarterFromId(p.get("quarter"))?.id ?? null;

  // Whether the quarter was ASKED FOR or merely defaulted to. A defaulted
  // quarter is only a guess, and the app is free to replace it with the most
  // recent quarter that actually has a report. One the reader chose is not a
  // guess, and moving them off it would be taking the wheel.
  return {
    agency,
    view,
    quarter: urlQuarter ?? DEFAULTS.quarter,
    quarterExplicit: urlQuarter !== null,
  };
}

export function useUrlState() {
  const [state, setState] = useState(readUrl);

  // `replace` rewrites the current history entry instead of adding one, and
  // leaves quarterExplicit alone. It is for the app correcting its own default,
  // which must not cost a Back press or count as the reader's choice.
  const navigate = useCallback((updates, { replace = false } = {}) => {
    setState((prev) => {
      const next = { ...prev, ...updates };
      if ("quarter" in updates && !replace) next.quarterExplicit = true;

      const u = new URL(window.location.href);
      PARAMS.forEach((k) => u.searchParams.set(k, next[k]));
      if (replace) window.history.replaceState(null, "", u.toString());
      else window.history.pushState(null, "", u.toString());
      return next;
    });
  }, []);

  // A link from before quarters carried their fiscal year says "?quarter=q2".
  // It still opens, resolved against the last four quarters, and the address
  // bar is rewritten to the full id so that copying it now gives a link that
  // keeps pointing at this quarter.
  useEffect(() => {
    if (!state.quarterExplicit) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("quarter") === state.quarter) return;
    u.searchParams.set("quarter", state.quarter);
    window.history.replaceState(null, "", u.toString());
  }, [state.quarter, state.quarterExplicit]);

  useEffect(() => {
    const handler = () => setState(readUrl());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return [state, navigate];
}
