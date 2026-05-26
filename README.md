# Quarterly Report Dashboard

A live marketing analytics dashboard built for three sister staffing agencies — **Integrated Staffing (ISL)**, **Accountant Staffing (AS)**, and **Administrative Staffing (ADS)**. It pulls real-time data from Google Sheets via Google Apps Script and presents it across three report views: Social Media, Website, and Trends.

---

## What it does

Each quarter, this dashboard gives a single source of truth for how each agency is performing across its digital channels. Rather than exporting spreadsheets or building static slide decks, the data lives in Google Sheets and the dashboard reads it live — so the numbers are always current.

**Three views, one app:**

- **Social Media** — KPIs (impressions, engagements, followers, etc.), platform-by-platform breakdown, trend chart, top posts, a searchable/filterable all-posts table, and editor's insights
- **Website** — traffic KPIs, channel breakdown (organic, direct, referral, paid, social), top pages with deltas vs. prior quarter
- **Trends** — quarter-over-quarter trajectory for key metrics across Q1, Q2, and Q3, with a pace-based projection for where Q3 will finish

Any combination of agency and quarter is a URL — switch between them instantly without a page reload.

---

## Tech stack

| Layer | Tool |
|---|---|
| UI framework | [React 18](https://react.dev) |
| Build tool | [Vite 5](https://vitejs.dev) |
| Charts | [Chart.js 4](https://www.chartjs.org) |
| Data source | Google Sheets + [Google Apps Script](https://developers.google.com/apps-script) |
| Styling | Custom CSS design system (`editorial.css`) |
| Typography | [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) via Google Fonts |
| Routing | Custom URL-param hook (no router library) |
| Hosting | GitHub Pages |

No backend, no database, no authentication. The entire app is a static bundle that fetches JSON from two Google Apps Script endpoints.

---

## How the data flows

Data lives in Google Sheets. A Google Apps Script `doGet` function is deployed as a web app for each report type (social/trends and web). The dashboard hits those endpoints with a `?report=` query param at load time:

```
Social endpoint:  ?report=islq3   → returns ISL Q3 social data
Web endpoint:     ?report=webq3   → returns Q3 web data (not agency-specific)
```

The script looks up the right sheet tab by that key and returns a consistent JSON shape. The dashboard doesn't branch on agency — it just reads the shape and renders it, so the same components work for all three agencies.

---

## Project structure

```
.
├── src/
│   ├── main.jsx                  # App root — URL state, nav, page switching
│   ├── config.js                 # Agencies, quarters, API endpoints
│   ├── utils.js                  # Number formatting helpers
│   ├── components/
│   │   ├── Nav.jsx               # Sticky nav bar (agency switcher + tabs + quarter chooser)
│   │   ├── LoadingScreen.jsx     # Full-screen overlay on first load
│   │   ├── PageLoader.jsx        # Animated bar while a view's data fetches
│   │   └── Delta.jsx             # ▲/▼ change badge
│   ├── hooks/
│   │   ├── useUrlState.js        # URL-param-driven state (pushState + popstate)
│   │   ├── useSocialReport.js    # Fetches + normalises social media data
│   │   ├── useWebReport.js       # Fetches web data + previous quarter for deltas
│   │   └── useTrendsData.js      # Fetches all 3 quarters in parallel, pace projections
│   └── pages/
│       ├── SocialPage.jsx        # Social media view
│       ├── WebPage.jsx           # Website view
│       └── TrendsPage.jsx        # Trends & projections view
├── index.html                    # Single HTML entry point
├── editorial.css                 # Full design system (layout, type, components)
├── vite.config.js
└── package.json
```

---

## URL structure

The entire app state lives in URL params — no router library needed. Sharing or bookmarking a URL always opens the exact same view.

| Param | Options | Default |
|---|---|---|
| `agency` | `isl` · `as` · `ads` | `isl` |
| `quarter` | `q1` · `q2` · `q3` | `q3` |
| `view` | `social` · `web` · `trends` | `social` |

**Examples:**
```
/?agency=as&quarter=q2&view=web        → Accountant Staffing, Q2, Website view
/?agency=ads&view=trends               → Administrative Staffing, Trends view
/?quarter=q1&view=social               → ISL Q1 Social Media
```

---

## Running locally

```bash
npm install
npm run dev
```

The app opens at `http://localhost:5173`. It fetches live data from the Google Apps Script endpoints, so an internet connection is required for data to load. The UI and navigation work offline; only the data panels will show a loading/error state.

**Other commands:**

```bash
npm run build    # Production bundle → dist/
npm run preview  # Serve the dist/ build locally
```

---

## Adding a new quarter

Open `src/config.js` and add an entry to the top of the `QUARTERS` array:

```js
export const QUARTERS = [
  { suffix: "q4", label: "Q4", rangeLabel: "Jun–Aug 2026", year: "2026" }, // ← add here
  { suffix: "q3", label: "Q3", rangeLabel: "Mar–May 2026", year: "2026" },
  ...
];
```

Also add the matching entry to `TRENDS_QUARTERS` if you want it to appear in the Trends view. That's it — the nav quarter chooser and all data hooks pick it up automatically.

---

## Adding a new agency

Open `src/config.js` and add an entry to `AGENCIES`:

```js
export const AGENCIES = {
  isl: { label: "ISL", name: "Integrated Staffing",    prefix: "isl", url: "https://integratedstaffing.ca" },
  as:  { label: "AS",  name: "Accountant Staffing",     prefix: "as",  url: "https://accountantstaffing.ca" },
  ads: { label: "ADS", name: "Administrative Staffing", prefix: "ads", url: "https://administrativestaffing.ca" },
  // new: { label: "NEW", name: "New Agency", prefix: "new", url: "https://newagency.ca" },
};
```

Then add a badge colour in `editorial.css`:

```css
.agency-badge-new { background: #2d6a4f; }
```

The agency will appear in the switcher dropdown immediately. Make sure the Google Apps Script returns data under the expected report key (`new` + quarter suffix, e.g. `newq3`).

---

## Q3 pace projections (Trends view)

The Trends page projects where Q3 will finish before the quarter ends. It uses a blended model:

- **20%** simple rate (total so far ÷ days elapsed × total days)
- **40%** 7-day rolling average daily rate
- **40%** linear regression over available daily snapshots

Confidence ramps from 0% to 100% over the first 14 days of the quarter. Before day 14, the projection blends toward the Q2 rate. Snapshots are stored in `localStorage` each time the Trends page loads, keyed by agency.

---

## Deployment

The app builds to a static bundle with no server-side requirements. Push `dist/` to GitHub Pages (or any static host). The `dist/` folder is gitignored and rebuilt on each deploy.
