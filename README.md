# Quarterly Report Dashboard

A live marketing analytics dashboard built for three sister staffing agencies — **Integrated Staffing (ISL)**, **Accountant Staffing (AS)**, and **Administrative Staffing (ADS)**. Data lives in Supabase and is edited through a built-in admin, with three report views per agency: Social Media, Website, and Trends.

---

## What it does

Each quarter, this dashboard gives a single source of truth for how each agency is performing across its digital channels. Rather than exporting spreadsheets or building static slide decks, the data lives in Supabase and the dashboard reads it live, so the numbers are always current.

**Three views, one app:**

- **Social Media** — KPIs (impressions, engagements, followers, etc.), quarter-by-quarter KPI chart, platform-by-platform breakdown, top posts, a searchable/filterable all-posts table with calendar view, and editor's insights
- **Website** — traffic KPIs, channel breakdown (organic, direct, referral, paid, social), top pages with deltas vs. prior quarter, and a contact-forms section (submission KPIs, weekly trend by intent, branch + source breakdowns, day×hour heatmap) fed by aggregate-only stats so no submitter PII reaches the public page
- **Trends** — quarter-over-quarter trajectory for key metrics, with a pace-based projection for where the current quarter will finish
- **Admin** (`/admin`) — magic-link sign-in, tabbed forms for every section of both report types, CSV import for the post log, unsaved-changes guards, and a Submissions tab (auth-only, since rows carry PII) with contact-form CSV import (dedup-safe re-imports), an employer-lead spotlight, and a searchable/filterable submissions table

Any combination of agency and quarter is a URL. You can switch between them instantly without a page reload.

---

## Tech stack

| Layer | Tool |
|---|---|
| UI framework | [React 18](https://react.dev) |
| Build tool | [Vite 5](https://vitejs.dev) |
| Charts | [Chart.js 4](https://www.chartjs.org) + hand-built SVG charts |
| Data + auth | [Supabase](https://supabase.com) (Postgres + RLS + magic-link auth) |
| Styling | Custom CSS design system (`editorial.css`) |
| Typography | [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) via Google Fonts |
| Routing | Custom URL-param hook (no router library) |
| Lint / format / test | ESLint 9, Prettier, Vitest |
| Hosting | Cloudflare Pages |

---

## Getting started

```bash
cp .env.example .env.local   # fill in the Supabase URL + anon key
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint over the project |
| `npm test` | Vitest (formatting, quarter calendar, projection math) |
| `npm run format` | Prettier over `src/` |

CI (`.github/workflows/ci.yml`) runs lint, tests, and a build on every push and PR. Deployment is handled by Cloudflare Pages from the repo.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase anon (publishable) key — safe client-side; RLS is the access control |
| `VITE_ERROR_WEBHOOK_URL` | no | If set, runtime errors are POSTed as JSON to this URL in production |

---

## How the data flows

All report data lives in Supabase Postgres (`social_reports`, `web_reports`, and their child tables, plus `projection_snapshots` for trends history). The public report pages read with the anon key under row-level security; the admin writes after a magic-link sign-in.

Data fetching is resilient by default: transient failures retry with exponential backoff, reports are cached for the session and revalidated in the background (so switching agency/quarter is instant), and error states distinguish offline from service failures. The Trends view refreshes every 5 minutes while the tab is visible.

`migrate-from-sheets.js` is the one-off script that migrated the original Google Sheets data into Supabase; it's kept for reference.

---

## Automated GA4 ingestion (Website report)

`supabase/functions/ga4-web-sync/` pulls quarter-to-date website figures from the GA4 Data API into `web_reports` once a week, so the Website tab stops being typed by hand.

**What it writes, and what it deliberately does not.** The job owns `sessions`, `users`, `engagement_rate` and `avg_engagement_time_sec` on `web_kpis`, plus the whole of `web_channels` and `web_pages`. It never touches `summary_bullet`, the four `web_insights` blocks, `actions`, or `form_submissions`. Those are hand-entered and stay that way: `actions` ("campaign clicks") has no GA4 equivalent, and Squarespace exposes no analytics API for form submissions.

That guarantee is enforced by the database, not by the job. `save_web_report(payload jsonb)` merges on **key presence** — a key absent from the payload leaves the stored column untouched, a key present writes it — so any partial writer is safe by construction. The job simply omits what it does not own.

**Field mapping.** GA4 API names differ from the UI labels; the reasoning for each choice is in `mapping.ts` beside the code. In summary: `sessions` → `sessions`, `users` → `totalUsers`, `engagement_rate` → `engagementRate` × 100, `avg_engagement_time_sec` → `userEngagementDuration / sessions`, channels → `sessionDefaultChannelGroup` (with GA4's "Organic Social" renamed to the report's "Social"), pages → `pagePath` mapped through a per-brand label map, `page_views` → `screenPageViews`, `bounce_rate` → `bounceRate` × 100. `share_of_traffic` is computed; GA4 has no such metric.

**Safety properties.** Re-running writes the same row rather than a duplicate. A GA4 call that fails or returns nothing logs and exits without writing, because a partial write is worse than no write. For two weeks after a fiscal quarter rolls over the job also closes out the quarter that just ended, so no quarter is left permanently short of its final week.

**Failure visibility.** Every attempt writes a row to `ingestion_runs` (success, failed, or skipped, with the reason). The Website admin tab shows the latest one and warns when the last success is older than the weekly schedule allows, since a job that stops running is the failure that otherwise goes unnoticed until reporting time.

### Setting it up

1. **Google Cloud.** Create a project, enable the **Google Analytics Data API**, create a service account, and download a JSON key. In GA4, add the service account's email as a **Viewer** on each property (Admin → Property Access Management).
2. **Credentials.** The function looks in the environment first and the database second, for both the credential and the property IDs.
   - *Preferred, needs dashboard access:* set the function secrets `GA4_SERVICE_ACCOUNT_JSON` (the whole downloaded JSON file as one value), `GA4_PROPERTY_ISL` and `GA4_PROPERTY_AS`. Adding ADS later means setting `GA4_PROPERTY_ADS`; no code change.
   - *Fallback, needs only database access:* property IDs go in the `integration_config` table, and the service-account JSON goes into Supabase Vault through a one-time install call (`{"install_token": "...", "credential": {...}}`) gated by a single-use token minted in the database. See `20260915000004_ga4_credentials_in_vault.sql`. This exists because setting a function secret requires dashboard access to the project, which can be lost independently of the database. Setting the secret later takes precedence automatically, with no code change and nothing to undo.
3. **Deploy:** `supabase functions deploy ga4-web-sync`
4. **Verify before scheduling.** Invoke it with `{"dry_run": true, "agencies": ["isl"]}`. It fetches and computes but writes nothing, and returns both the raw GA4 responses and the payload it would have sent. Check the figures against the GA4 UI, and check that the page labels matched — a wrong path in the label map shows up as a warning saying how many paths matched.
5. **Schedule.** Store the function URL and the service-role key in Vault (the commands are in `20260915000003_schedule_ga4_web_sync.sql`), then apply that migration. It adds a `pg_cron` job for Mondays at 15:00 UTC.

Nothing in steps 1–5 puts a credential in the repository, and nothing should.

---

## Project structure

```
.
├── src/
│   ├── main.jsx                  # App root — URL state, nav, page switching, agency theming
│   ├── config.js                 # Agencies, fiscal quarter calendar, report timezone
│   ├── utils.js                  # Number/delta formatting helpers
│   ├── lib/
│   │   ├── supabase.js           # Supabase client
│   │   ├── fetching.js           # Retry, friendly errors, report cache (SWR)
│   │   └── monitor.js            # Global error reporting (optional webhook)
│   ├── components/
│   │   ├── Nav.jsx               # Sticky nav (agency switcher + tabs + quarter chooser)
│   │   ├── SectionRail.jsx       # Sticky section index on wide screens
│   │   ├── Icons.jsx             # Inline SVG icon set
│   │   ├── CountUp.jsx           # Animated KPI numbers (reduced-motion aware)
│   │   ├── LoadingScreen.jsx / PageLoader.jsx / Skeleton.jsx
│   │   ├── ErrorBoundary.jsx / EmptyState.jsx / Delta.jsx
│   ├── hooks/
│   │   ├── useUrlState.js        # URL-param-driven state (pushState + popstate)
│   │   ├── useSocialReport.js    # Social data + previous quarter for deltas
│   │   ├── useWebReport.js       # Web data + previous quarter for deltas
│   │   ├── useSocialKpiHistory.js# KPI history across quarters
│   │   ├── useTrendsData.js      # All 3 quarters in parallel, pace projections
│   │   └── useAuth.js            # Supabase magic-link session
│   └── pages/
│       ├── SocialPage.jsx / WebPage.jsx / TrendsPage.jsx
│       └── admin/                # Login, dashboard shell, Social/Web forms
├── supabase/
│   ├── migrations/               # Schema, RLS, transactional save functions, pg_cron schedules
│   └── functions/
│       └── ga4-web-sync/         # Weekly GA4 → web_reports ingestion (Deno edge function)
│           ├── index.ts          # Auth, GA4 calls, writes, run logging
│           ├── mapping.ts        # Fiscal calendar + GA4-to-column translation (pure)
│           └── mapping.test.ts   # Runs under Vitest; no credentials needed
├── index.html
├── editorial.css                 # Full design system (tokens, layout, components)
├── eslint.config.js / .prettierrc.json
└── vite.config.js                # Vite + Vitest config
```

---

## URL structure

The entire app state lives in URL params. Sharing or bookmarking a URL always opens the exact same view.

| Param | Options | Default |
|---|---|---|
| `agency` | `isl` · `as` · `ads` | `isl` |
| `quarter` | `q1` · `q2` · `q3` · `q4` | current quarter |
| `view` | `social` · `web` · `trends` | `social` |

**Examples:**
```
/?agency=as&quarter=q2&view=web        → Accountant Staffing, Q2, Website view
/?agency=ads&view=trends               → Administrative Staffing, Trends view
```

---

## Adding a new quarter

Nothing to do. The dashboard detects the current quarter automatically (pinned to `America/Halifax` so every viewer sees the same default, regardless of their local clock) and generates `QUARTERS` and `TRENDS_QUARTERS` at runtime. When a new quarter starts, the nav defaults to it and the Trends page rolls forward — no code changes.

The fiscal calendar is defined in `src/config.js` as `Q_DEFS` (fiscal year starts September):

```js
const Q_DEFS = [
  { suffix: "q1", label: "Q1", startM: 8,  endM: 11, range: "Sep–Nov" },
  { suffix: "q2", label: "Q2", startM: 11, endM: 2,  range: "Dec–Feb" },
  { suffix: "q3", label: "Q3", startM: 2,  endM: 5,  range: "Mar–May" },
  { suffix: "q4", label: "Q4", startM: 5,  endM: 8,  range: "Jun–Aug" },
];
```

`startM`/`endM` are 0-indexed months; `endM` is the exclusive boundary. The quarter boundary logic is covered by tests in `src/config.test.js`.

---

## Adding a new agency

Open `src/config.js` and add an entry to `AGENCIES`:

```js
export const AGENCIES = {
  isl: { label: "ISL", name: "Integrated Staffing",     prefix: "isl", url: "https://integratedstaffing.ca" },
  // new: { label: "NEW", name: "New Agency", prefix: "new", url: "https://newagency.ca" },
};
```

Then in `editorial.css` add a badge colour and (optionally) an accent override:

```css
.agency-badge-new { background: #2d6a4f; }
body[data-agency="new"] { --accent: #2d6a4f; }
```

The agency appears in the switcher immediately; data hooks and the admin pick it up automatically. Make sure rows exist in Supabase under the new agency key.

---

## Current-quarter pace projections (Trends view)

The Trends page projects where the current quarter will finish before it ends, using a blended model of three signals — simple rate (total ÷ days elapsed), a 7-day rolling rate, and a linear regression over daily snapshots — with weights that shift toward the data-driven signals as the quarter matures. Early in the quarter the projection is anchored toward the prior quarter's daily rate, and a calibration factor learned from the previous quarter's projection accuracy nudges the result. Snapshots are stored in the `projection_snapshots` table whenever the Trends page loads.

The model is pure-function code in `src/hooks/useTrendsData.js`, covered by tests in `src/hooks/useTrendsData.test.js`.

---

## Post-click journeys (Paid Media view)

The Paid Media view carries the click through to the site: for each campaign — and, if you'd rather report on paid traffic as a whole, for the account — an "After the click" block shows how many sessions landed, how many moved past the landing page, how deep they got, and how many converted, over a flow diagram of the traffic step by step and a table of the actual routes.

One row of `paid_media_click_paths` is one journey: the ordered pages a group of sessions visited, and how many sessions took exactly that route. A journey ends where the session ended, so drop-off is a fact of the data rather than a separate figure to keep in step. Everything on the page — landing pages, the flow, the leak at each step, the ranked journeys — is derived from that (`src/lib/clickPaths.js`, tested in `clickPaths.test.js`).

Enter them in **Admin → Social → Paid Media**, either per campaign or in the site-wide block underneath. Importing replaces that scope's journeys, since an export describes all of its scope's traffic and merging one in twice would double every session. Three input shapes are read:

| Source | Shape |
|---|---|
| `GA4 → Explore → Path exploration`, exported as CSV | one column per step (`STEP +0`, `STEP +1`, …) plus a sessions column |
| Any sheet with a route column | `Page path, Sessions, Key events` — route delimited by `>`, `->`, `→` or `\|` |
| Rows pasted from a spreadsheet | `/warehouse-jobs > /jobs > /apply` ⇥ `120` ⇥ `8`, no header needed |

Hosts, query strings and hashes are dropped (`/jobs?loc=halifax` → `/jobs`), repeated pages collapse, and end-of-session markers like `(not set)` end the route. Past 150 journeys the tail is summed into one "other" row, which counts toward the session total so shares stay honest but isn't drawn.

---

## Deployment

The app builds to a static bundle with no server-side requirements (`npm run build` → `dist/`). Hosting is Cloudflare Pages with `public/_redirects` handling SPA routing; any static host works. Set the two Supabase environment variables in the host's build settings.
