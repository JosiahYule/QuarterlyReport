import { useState, useCallback, useEffect } from "react";
import { AGENCIES, QUARTERS, VIEWS, CURRENT_QUARTER } from "../config.js";

const DEFAULTS = { agency: "isl", quarter: CURRENT_QUARTER.suffix, view: "social" };

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const agency  = AGENCIES[p.get("agency")]                           ? p.get("agency")  : DEFAULTS.agency;
  const quarter = QUARTERS.find(q => q.suffix === p.get("quarter"))  ? p.get("quarter") : DEFAULTS.quarter;
  const view    = VIEWS.includes(p.get("view"))                       ? p.get("view")    : DEFAULTS.view;
  return { agency, quarter, view };
}

export function useUrlState() {
  const [state, setState] = useState(readUrl);

  const navigate = useCallback((updates) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      const u = new URL(window.location.href);
      Object.entries(next).forEach(([k, v]) => u.searchParams.set(k, v));
      window.history.pushState(null, "", u.toString());
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = () => setState(readUrl());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return [state, navigate];
}
