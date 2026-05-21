# Quarterly Report — Unified Dashboard

A static, GitHub Pages-friendly reporting site covering all three sister agencies:
**Integrated Staffing (ISL)**, **Accountant Staffing (AS)**, and **Administrative Staffing (ADS)**.

---

## How it works (the short version)

All three agencies share **one dashboard per report type** (social media, website, trends). The
active agency and active quarter are controlled entirely by two URL parameters:

| Param    | Values                        | Example        |
|----------|-------------------------------|----------------|
| `agency` | `isl` · `as` · `ads`          | `?agency=as`   |
| `report` | `{prefix}q{n}`                | `?report=asq3` |

The agency switcher in the masthead rewrites both params and reloads the page. The quarter
chooser in the nav bar rewrites only `report`, preserving the current agency.

**Report key convention:**

| Agency                | Prefix | Q1     | Q2     | Q3     |
|-----------------------|--------|--------|--------|--------|
| Integrated Staffing   | `isl`  | islq1  | islq2  | islq3  |
| Accountant Staffing   | `as`   | asq1   | asq2   | asq3   |
| Administrative Staffing | `ads` | adsq1  | adsq2  | adsq3  |

Your Apps Script endpoint receives `?report=asq3` (or whichever key) and returns the correct
dataset. The HTML never needs to know which agency it is — only the URL param and the JSON shape matter.

---

## Repository structure (after cleanup)

```text
.
├── index.html              # Social media report (all agencies, all quarters)
├── web/
│   └── index.html          # Website report (all agencies, all quarters)
├── trends/
│   └── index.html          # Trends & projections (ISL only for now)
├── editorial.css           # Shared design system
├── nav.jsx                 # Shared masthead + nav + agency switcher + loading screen
├── favicon-gear.svg
└── README.md
```

### What to delete from the repo

These files are superseded by the unified approach and can be removed:

| Path              | Why it can go                                          |
|-------------------|--------------------------------------------------------|
| `as/as.html`      | Replaced by `index.html?agency=as`                     |
| `ads/ads.html`    | Replaced by `index.html?agency=ads`                    |
| `2026q1/q1.html`  | Archived quarter; keep `2026q1/2026-q1.json` if needed |
| `2026q2/q2.html`  | Superseded by `index.html?report=islq2`                |
| `2026q3/q3.html`  | Superseded by `index.html?report=islq3`                |
| `web/web-data.json` | Only needed if you want a local fallback for web data |

Keep the `2026q1/2026-q1.json` file if you want Q1 data locally archived, but the HTML
shell for it is no longer needed once the main dashboard handles all quarters.

---

## Updating nav.jsx when adding a new quarter

Open `nav.jsx` and add one entry to the `QUARTERS` array:

```js
const QUARTERS = [
  { suffix: "q4", label: "Q4", rangeLabel: "Jun–Aug 2026", year: "2026" }, // ← add
  { suffix: "q3", label: "Q3", rangeLabel: "Mar–May 2026", year: "2026" },
  { suffix: "q2", label: "Q2", rangeLabel: "Dec–Feb 2026", year: "2026" },
  { suffix: "q1", label: "Q1", rangeLabel: "Sep–Nov 2025", year: "2025" },
];
```

That's it. The quarter chooser in the nav bar will show the new entry for all three agencies
automatically, and it will build the correct report key (`islq4`, `asq4`, `adsq4`) from the prefix.

---

## Updating nav.jsx when adding a new agency

Open `nav.jsx` and add one entry to the `AGENCIES` object:

```js
const AGENCIES = {
  isl:  { label: "ISL",  name: "Integrated Staffing",    prefix: "isl",  url: "https://integratedstaffing.ca"    },
  as:   { label: "AS",   name: "Accountant Staffing",     prefix: "as",   url: "https://accountantstaffing.ca"    },
  ads:  { label: "ADS",  name: "Administrative Staffing", prefix: "ads",  url: "https://administrativestaffing.ca" },
  // new: { label: "NEW", name: "New Agency", prefix: "new", url: "https://newagency.ca" },
};
```

Then add a badge colour for it in the injected CSS block:

```css
.agency-badge-new { background: #2d6a4f; }
```

---

## Apps Script requirements

Your Apps Script `doGet` function must:

1. Accept a `?report=` parameter.
2. Use it as a lookup key to find the correct sheet tab or named range.
3. Return **identical JSON shape** regardless of which agency or quarter is requested.

The dashboard code does not branch on agency — it only reads the JSON shape. If the shape is
consistent, the same rendering logic works for ISL, AS, and ADS.

See the "Reconciling the Apps Script" section (next steps) for the full `doGet` pattern.

---

## Loading screen

The loading screen now shows "Loading Report" generically. It is rendered by `nav.jsx`
and fades out when each page calls `hideLoadingScreen()` after its data has rendered.

---

## Local preview

```bash
python3 -m http.server 8000
```

- `http://localhost:8000/` — ISL social (default)
- `http://localhost:8000/?agency=as&report=asq3` — AS social Q3
- `http://localhost:8000/web/?agency=ads` — ADS website
- `http://localhost:8000/trends/` — Trends page

---

## Deployment

Push to your GitHub Pages publishing branch. No build step required — all files are static.
