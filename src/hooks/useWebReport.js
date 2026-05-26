import { useState, useEffect } from "react";
import { WEB_ENDPOINT, QUARTERS } from "../config.js";

function getPrevKey(key) {
  const m = key.match(/^(.*?)(\d+)$/i);
  if (!m) return null;
  const n = Number(m[2]);
  return n <= 1 ? null : m[1] + (n - 1);
}

async function fetchReport(key, signal) {
  const res = await fetch(`${WEB_ENDPOINT}?report=${key}&t=${Date.now()}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useWebReport(quarter) {
  const [state, setState] = useState({ data: null, prevData: null, status: "loading", error: null });

  useEffect(() => {
    const reportKey = "web" + quarter;
    const controller = new AbortController();
    setState({ data: null, prevData: null, status: "loading", error: null });

    (async () => {
      try {
        const data = await fetchReport(reportKey, controller.signal);
        setState(s => ({ ...s, data, status: "ready" }));

        const prevKey = getPrevKey(reportKey);
        if (prevKey) {
          try {
            const prevData = await fetchReport(prevKey, controller.signal);
            setState(s => ({ ...s, prevData }));
          } catch (e) {
            if (e.name !== "AbortError") console.warn("Previous quarter unavailable:", e.message);
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setState({ data: null, prevData: null, status: "error", error: err.message || "Failed to load report" });
      }
    })();

    return () => controller.abort();
  }, [quarter]);

  return state;
}
