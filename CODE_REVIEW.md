# Quarterly Report Code Review (May 25, 2026)

## High-priority issues

1. **Startup race condition between data fetch and app bootstrap**
   - `index.html` starts an async IIFE to fetch report data, then immediately loads `app.jsx` via Babel.
   - If `app.jsx` renders before `window.ISL_REPORT` is set, first-render behavior is timing-dependent and can produce empty-state flashes or initialization errors.
   - Evidence: async fetch assignment at `index.html` lines 25–35 followed by immediate script loading at lines 37–39.

2. **No fetch error handling on core social report endpoint**
   - The main social data fetch does not check `res.ok` and has no `try/catch` around network failures or invalid JSON.
   - A transient endpoint issue can break the page without fallback UX.
   - Evidence: `fetch(...)` and `await res.json()` with no guards in `index.html` lines 29–33.

3. **Potential runtime crash in KPI rendering when deltas are missing**
   - `Numbers` assumes `data.deltas[k.key]` always exists and dereferences `d.dir`/`d.pct` unconditionally.
   - Any partial dataset or key mismatch will throw.
   - Evidence: `const d = data.deltas[k.key];` then `d.dir`/`d.pct` in `app.jsx` lines 199–206.

## Medium-priority design / architecture risks

4. **Cross-section nav drops `report` parameter (state continuity bug)**
   - Tab hrefs preserve `agency` only; they do not pass `report`.
   - Moving between Social/Web/Trends can silently reset quarter context by falling back to per-page defaults.
   - Evidence: tab links in `nav.jsx` lines 223–227 build params with only `{ agency: currentAgency }`.

5. **Inconsistent quarter/report model between social and web pages**
   - Social uses agency-prefixed report keys (`islq3`, `asq3`, `adsq3`), while web defaults to `webq3`.
   - Without a single router contract, users can land on a URL with mixed semantics, increasing data mismatch risk.
   - Evidence: social default report in `index.html` line 28; web default in `web/index.html` line 93.

6. **Client-side Babel in production path (performance + reliability)**
   - Both pages compile JSX in-browser using `@babel/standalone`, increasing boot time and blocking interactivity on slower devices.
   - Evidence: script include in `index.html` line 22 and `web/index.html` line 56 plus `type="text/babel"` scripts.

## UX / UI improvements

7. **Missing explicit loading/error states tied to fetch lifecycle**
   - You have a generic loading screen in `nav.jsx`, but the data fetch lifecycle in `index.html` and `web/index.html` does not reliably signal success/failure transitions.
   - Recommendation: centralize fetch state (`loading | loaded | error`) and display user-facing retry messaging.

8. **Quarter labels are hardcoded and time-sensitive**
   - `QUARTERS` ranges are static and currently pinned to Sep 2025–May 2026.
   - As new quarters roll in, stale labels will confuse users and reduce trust.
   - Evidence: `nav.jsx` lines 45–49.

9. **Potential accessibility gap in menu keyboard behavior**
   - Agency switcher uses `role="menu"/"menuitem"` but does not implement arrow-key roving focus semantics expected of menu patterns.
   - Recommendation: either implement full WAI-ARIA menu keyboard support or switch to simpler listbox/button semantics.

## Suggested remediation order

1. Stabilize bootstrap/data flow (issue #1 + #2).
2. Add defensive defaults in KPI/delta rendering (issue #3).
3. Unify URL contract for quarter/report across all sections (issue #4 + #5).
4. Move from in-browser Babel to prebuilt JS bundles (issue #6).
5. Improve UX states and accessibility semantics (issue #7 + #9).
