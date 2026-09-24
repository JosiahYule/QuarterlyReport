# Quarterly Report Dashboard

A live marketing analytics dashboard for three sister staffing agencies: **Integrated Staffing (ISL)**, **Accountant Staffing (AS)** and **Administrative Staffing (ADS)**. Data lives in Supabase and is edited through a built-in admin, with four report views per agency: Social Media, Website, Paid Media and Trends.

---

## What it does

Each quarter, this dashboard is the single source of truth for how each agency is performing across its digital channels. Rather than exporting spreadsheets or building static slide decks, the data lives in Supabase and the dashboard reads it live.

**Four views, one app:**

- **Social Media:** KPIs (impressions, engagements, followers and so on), a quarter-by-quarter KPI chart, a platform-by-platform breakdown, top posts, a searchable and filterable post log with a calendar view, and the editor's insights.
- **Website:** traffic KPIs, channel breakdown, top pages with deltas against the prior quarter, and a contact-forms section (submission KPIs, weekly trend by intent, branch and source breakdowns, a day-by-hour heatmap) fed by aggregate-only stats, so no submitter's personal details reach the public page.
- **Paid Media:** campaigns and ads with spend, reach and conversion metrics, LinkedIn audience demographics, and post-click journeys through the site.
- **Trends:** quarter-over-quarter trajectory for key metrics, with a pace-based projection of where the current quarter will finish.
- **Admin** (`/admin`): magic-link sign-in for listed admins, tabbed forms for every section of each report, CSV import for the post log, unsaved-changes guards, and a Submissions tab (admin-only, since its rows hold personal details) with a dedup-safe contact-form CSV import.

Every combination of agency, quarter and view is a URL, and switching between them needs no page reload.

---

## Tech stack

| Layer | Tool |
|---|---|
| UI framework | [React 18](https://react.dev) |
| Build tool | [Vite 5](https://vitejs.dev) |
| Charts | [Chart.js 4](https://www.chartjs.org) and hand-built SVG charts |
| Data and auth | [Supabase](https://supabase.com) (Postgres, row-level security, magic-link auth, pg_cron) |
| Styling | Custom CSS design system (`editorial.css`) |
| Typography | [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) via Google Fonts |
| Routing | Custom URL-param hook (no router library) |
| Lint, format, test | ESLint 9, Prettier, Vitest |
| Hosting | Cloudflare Pages |

---

## Getting started

```bash
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint over the project |
| `npm test` | Vitest: quarter calendar, data hooks, projection maths, importers, pages |
| `npm run format` / `format:check` | Prettier over `src/` |

CI (`.github/workflows/ci.yml`) runs lint, the format check, the tests and a build on every push and pull request. Cloudflare Pages deploys from the repo.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase anon (publishable) key. It is safe in the browser: row-level security is the access control. |
| `VITE_ERROR_WEBHOOK_URL` | no | If set, runtime errors are POSTed as JSON to this URL in production |

---

## How the data flows

All report data lives in Supabase Postgres: `social_reports` and `web_reports` with their child tables, the `paid_media_*` tables (which hang off `social_reports`), `form_submissions`, and `projection_snapshots` / `projection_audits` for the Trends history.

The public pages read with the anon key. Anyone can read the report tables; only admins can write them, and only admins can read `form_submissions`. The public Website page gets contact-form figures through `form_submission_stats()`, which returns totals and breakdowns, never an individual submission.

Fetching is resilient by default: transient failures retry with exponential backoff, reports are cached for the session and refreshed in the background (so switching agency or quarter is instant), and error states tell being offline apart from a service failure. The Trends view refreshes every 5 minutes while the tab is visible.

---

## Admin access

Signing in is not enough to edit. The signed-in email must also be listed in `public.admins`, and every write policy (and the read policy on `form_submissions`) checks it through `public.is_admin()`. The sign-in page only signs in existing accounts; it never creates one.

To add an admin, run this in the Supabase SQL editor, then invite them from **Authentication → Users**:

```sql
insert into public.admins (email) values ('name@example.com');
```

To remove one, delete their row. Their access ends on their next request.

Also keep **Allow new users to sign up** switched off in the project's Authentication settings. The allowlist already stops a stranger's account from reading or changing anything, but there is no reason to let one be created.

---

## Database migrations

`supabase/migrations/` is the complete history of the database, named with the version numbers the live project recorded, so the folder and the project's migration list are the same list. Replaying the folder onto an empty Supabase project rebuilds the current schema.

New migrations have been applied through the Supabase connector (`apply_migration`), which stamps each one with the time it ran. After applying, rename the file to that version so the two lists stay identical.

---

## Website report data entry

Website figures are entered by hand in the admin, read off the GA4 interface once a quarter. There is no automated ingestion. An attempt at it was removed because the setup it needed (a Google Cloud service account, a credential store, a scheduled job) was far more machinery than the task justified.

**Where the numbers come from.** Open GA4 for the property, set the date range to the fiscal quarter, and read off:

| Field | GA4 location |
|---|---|
| Total Visits | Sessions |
| Unique Users | Total users |
| Engagement Rate | Engagement rate (enter as a percentage, e.g. `54.2`) |
| Avg Time on Site | Average engagement time per session (enter as seconds) |
| Traffic channels | Reports → Acquisition → Traffic acquisition, by *Session default channel group*. GA4's "Organic Social" is entered as "Social" to match the report's own naming. |
| Top pages | Reports → Engagement → Pages and screens |

`Campaign Clicks` and `Form Submissions` have no GA4 equivalent. Campaign clicks are counted from the ad platforms; form submissions come from the contact-form CSV import on the Submissions tab.

**Saving is atomic.** `save_web_report(payload jsonb)` and `save_social_report(payload jsonb)` write the report row and all its child tables in one transaction, so a failure partway through cannot leave a half-written quarter on the server. `save_web_report` merges on key presence (a key missing from the payload leaves the stored column alone), but the admin form sends every section on every save, so a field you clear really clears.

---

## Quarters

The fiscal year starts in September. A quarter has two names, for two audiences:

| | Example | Used by |
|---|---|---|
| Database key | `quarter = 'q2'`, `year = '2027'` | Every table, the save functions, the snapshot job. `year` is the calendar year of the quarter's last day. |
| Reader-facing | `q2-2026-27`, shown as **Q2 2026–27** (Dec 2026–Feb 2027) | The URL, the menus, page titles |

Readers see the fiscal year because the database year reads out of order: Q1 ends in the calendar year its fiscal year starts, while the other three end in the next, so "Q1 2026" (Sep–Nov 2026) looked older than "Q4 2026" (Jun–Aug 2026).

The quarter menus run from **Q1 2025–26**, the first quarter the report covers (`FIRST_QUARTER` in `src/config.js`), up to the current quarter, so no report ever falls out of reach. Nothing needs changing when a quarter rolls over: the current quarter is worked out from today's date in `America/Halifax`, so every viewer sees the same default whatever their own clock says. A fresh visit opens on the newest quarter that has a report.

The calendar itself is `Q_DEFS` in `src/config.js`. `startM` and `endM` are 0-indexed months, and `endM` is the exclusive boundary:

```js
const Q_DEFS = [
  { suffix: "q1", label: "Q1", startM: 8, endM: 11 },
  { suffix: "q2", label: "Q2", startM: 11, endM: 2 },
  { suffix: "q3", label: "Q3", startM: 2, endM: 5 },
  { suffix: "q4", label: "Q4", startM: 5, endM: 8 },
];
```

The rules are covered by `src/config.test.js`.

---

## URL structure

The app's state lives in the URL, so a shared or bookmarked link always opens the same view of the same quarter.

| Param | Options | Default |
|---|---|---|
| `agency` | `isl` · `as` · `ads` | `isl` |
| `quarter` | a quarter id such as `q4-2025-26` | the newest quarter with a report |
| `view` | `social` · `web` · `paid` · `trends` | `social` |

```
/?agency=as&quarter=q2-2025-26&view=web   → Accountant Staffing, Q2 2025–26, Website
/?agency=ads&view=trends                  → Administrative Staffing, Trends
```

Links from before quarters carried their fiscal year say `quarter=q2`. They still open, resolved against the last four quarters, and the address bar is upgraded to the full id.

---

## Adding a new agency

1. Widen the agency check on `social_reports` and `web_reports` in a new migration. Both tables only accept `isl`, `as` and `ads`, so a save for any other agency is rejected.
2. Add the agency to `AGENCIES` in `src/config.js`:

   ```js
   new: { label: "NEW", name: "New Agency", prefix: "new", url: "https://newagency.ca" },
   ```

3. Give it a colour in `editorial.css`:

   ```css
   .agency-badge-new { background: #2d6a4f; }
   body[data-agency="new"] { --accent: #2d6a4f; }
   ```

The switcher, the data hooks and the admin pick it up from there.

---

## Current-quarter pace projections (Trends view)

The Trends page projects where the current quarter will finish, blending three signals (the simple rate of total over days elapsed, a 7-day rolling rate, and a linear regression over daily snapshots) with weights that shift toward the data-driven signals as the quarter matures. Early in the quarter the projection leans on the prior quarter's daily rate, and a calibration factor learned from past quarters' projection accuracy nudges the result.

Snapshots are captured daily at 11:00 UTC by the `capture-projection-snapshots` pg_cron job. Audits of each finished quarter's accuracy are written to `projection_audits` when an admin views the Trends page, since they set the calibration every reader's projections are scaled by.

The model is pure-function code in `src/lib/projection.js`, covered by `projection.test.js` and `projection.pace.test.js`.

---

## Post-click journeys (Paid Media view)

The Paid Media view follows the click through to the site. For each campaign, and optionally for paid traffic as a whole, an "After the click" block shows how many sessions landed, how many moved past the landing page, how deep they got and how many converted, over a flow diagram of the traffic step by step and a table of the actual routes.

One row of `paid_media_click_paths` is one journey: the ordered pages a group of sessions visited, and how many sessions took exactly that route. A journey ends where the session ended, so drop-off is a fact of the data rather than a separate figure to keep in step. Everything on the page (landing pages, the flow, the leak at each step, the ranked journeys) is derived from that in `src/lib/clickPaths.js`, tested in `clickPaths.test.js`.

Enter them in **Admin → Social → Paid Media**, either per campaign or in the site-wide block underneath. Importing replaces that scope's journeys, since an export describes all of its scope's traffic and merging one in twice would double every session. `docs/prompts/click-path-import.md` is a prompt for turning raw analytics into the CSV. Three input shapes are read:

| Source | Shape |
|---|---|
| `GA4 → Explore → Path exploration`, exported as CSV | one column per step (`STEP +0`, `STEP +1`, …) plus a sessions column |
| Any sheet with a route column | `Page path, Sessions, Key events`, the route delimited by `>`, `->`, `→` or `\|` |
| Rows pasted from a spreadsheet | `/warehouse-jobs > /jobs > /apply` ⇥ `120` ⇥ `8`, no header needed |

Hosts, query strings and hashes are dropped (`/jobs?loc=halifax` → `/jobs`), repeated pages collapse, and end-of-session markers like `(not set)` end the route. Past 150 journeys the tail is summed into one "other" row, which counts toward the session total so shares stay honest but isn't drawn.

---

## Project structure

```
.
├── src/
│   ├── main.jsx                  # App root: URL state, nav, page switching, agency theming
│   ├── config.js                 # Agencies, views, fiscal quarter calendar, report timezone
│   ├── utils.js                  # Number, delta and paid-media formatting helpers
│   ├── lib/
│   │   ├── supabase.js           # Supabase client
│   │   ├── fetching.js           # Retry, friendly errors, cached stale-while-revalidate hook
│   │   ├── projection.js         # Trends pace model, calibration, anomalies
│   │   ├── clickPaths.js         # Post-click journey parsing and analysis
│   │   ├── linkedinDemographics.js / formSubmissions.js / sourceTrends.js
│   │   └── monitor.js / favicon.js
│   ├── components/               # Nav, section rail, charts, loaders, empty and error states
│   ├── hooks/                    # URL state, one data hook per report, auth
│   └── pages/
│       ├── SocialPage.jsx / WebPage.jsx / PaidPage.jsx / TrendsPage.jsx
│       └── admin/                # Login, dashboard shell, Social / Web forms, Submissions
├── supabase/migrations/          # Full schema history: tables, RLS, save functions, cron
├── docs/prompts/                 # Prompts for preparing import files
├── public/                       # favicon, Cloudflare Pages SPA redirect
├── index.html
├── editorial.css                 # Design system: tokens, layout, components
├── eslint.config.js / .prettierrc.json
└── vite.config.js                # Vite and Vitest config
```

---

## Deployment

The app builds to a static bundle with no server-side requirements (`npm run build` → `dist/`). Hosting is Cloudflare Pages with `public/_redirects` handling SPA routing; any static host works. Set the two Supabase environment variables in the host's build settings.
