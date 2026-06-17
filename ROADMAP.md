# Quarterly Report — v3 Roadmap

> **Where we are (v2):** a polished static SPA (React + Vite on Cloudflare Pages)
> backed by Supabase. Three agencies × three views (Social / Web / Trends), a
> magic-link admin, CSV import for the post log, resilient SWR data layer, and a
> blended pace-projection model on the Trends page.
>
> **What v3 is about:** turning a dashboard you *type into* every quarter into a
> system that **updates itself, interprets the numbers for you, and delivers the
> story to stakeholders** — with you reviewing and approving rather than
> transcribing.

---

## The one-sentence thesis

> Today the app is a beautiful **system of record**. v3 makes it a **system of
> intelligence**: data flows in from the source APIs on a schedule, the app
> drafts the narrative, flags what changed, and pushes the report out — so the
> quarterly close goes from a day of data entry to ten minutes of review.

Everything below ladders up to that.

---

## The single biggest win: kill manual data entry

Right now, every quarter, the work is roughly:

| Per agency (× 3) | Plus once | How it's entered today |
|---|---|---|
| 8 social KPIs | Web KPIs | Typed into `SocialForm` / `WebForm` |
| Platform breakdown (LI/FB/IG) | Channel breakdown | Typed by hand |
| Top posts per platform | Top pages | Typed by hand |
| Full post log | — | CSV export → import |
| 4 insight blocks | 4 insight blocks | Written by hand |

Almost all of that already exists, structured, in the source platforms (Meta,
LinkedIn, Google Analytics). v3's spine is connecting to those sources so the
admin forms become **"review & approve"** instead of **"type everything."**

---

## Architectural prerequisite (the thing that unlocks the rest)

The app is currently **100% static** — no server, no scheduled jobs. You can't
call the Meta/LinkedIn/GA4 APIs from the browser (secrets would leak, and CORS
blocks it), and `projection_snapshots` only get written when someone happens to
open the Trends page (`src/hooks/useTrendsData.js:105`), so the projection
history has holes.

**v3 needs a backend job runner.** Best fit for this stack:

- **Supabase Edge Functions + `pg_cron` / Scheduled Functions** — stays inside
  the database you already own, service-role secrets never touch the client.
- (Alt: Cloudflare Workers Cron — you're already on Cloudflare Pages; or a
  scheduled GitHub Action — simplest, you already have CI.)

Plus a secrets home: a new **`integration_credentials`** table (or Supabase
Vault) with RLS that allows **service-role only** — never the anon key. The
public pages keep reading under RLS exactly as they do now; only the new server
jobs hold the API tokens.

> **This is Phase 0. Nothing else automated can ship until it exists.** Budget a
> few days to stand up one scheduled edge function that writes a daily snapshot —
> that alone fixes the projection-history gaps and proves the pattern.

---

## Roadmap by phase

Effort: **S** ≈ days · **M** ≈ 1–2 weeks · **L** ≈ multi-week.
Impact is relative to *your* time saved + report usefulness.

### Phase 0 — Foundation for automation · `S–M`
*Enabler. Build once, everything else rides on it.*

- [ ] Scheduled job runner (Supabase Edge Function + `pg_cron`).
- [ ] `integration_credentials` table, service-role-only RLS; OAuth token storage + refresh.
- [ ] Move the Trends snapshot write out of the page load into a **daily cron** so
      `projection_snapshots` is complete regardless of who visits. *(High impact, tiny effort — do this first.)*
- [ ] A lightweight `ingestion_runs` log table (source, status, row counts, errors) surfaced in the admin.

### Phase 1 — Automated ingestion · `L` (per source) · **Impact: H**
*The headline feature. Each source you connect deletes a chunk of quarterly data entry.*

Sequenced easiest-and-highest-value first:

1. **Google Analytics 4 → Web report.** The GA4 Data API is the cleanest of the
   three (service-account auth, no app review). Maps directly:
   - sessions / users / engagement rate / avg engagement time / form submissions → `web_kpis`
   - default channel grouping → `web_channels`
   - top pages → `web_pages`
   - **Result: the entire Web report becomes zero-touch.**
2. **Meta Graph API → Facebook + Instagram.** Page Insights + IG Business
   insights → `social_kpis`, `social_platforms`, and the post log
   (`social_posts`). Requires a Meta app + OAuth + (eventually) app review.
3. **LinkedIn Community Management API → LinkedIn.** Organization follower/share
   statistics → the LinkedIn slice of `social_kpis` / `social_platforms` / top posts.
   Heaviest lift (LinkedIn's API access review is the strictest), so it comes last.

Design principle: **ingest into the existing tables, keep the admin as the
override layer.** A synced value can always be hand-corrected; mark rows
`source: 'auto' | 'manual'` so a human edit isn't clobbered by the next sync.

### Phase 2 — Intelligence layer · `M` · **Impact: H**
*Where it stops being a dashboard and starts being an analyst.*

- [ ] **AI-drafted insights (Claude API).** The four insight blocks
      (`working / not_working / actions / next_quarter`) are hand-written today.
      The data is already structured *and* you already compute quarter-over-quarter
      deltas and pace projections — feed those to Claude (server-side edge function)
      to draft the narrative. Add a **"Generate draft"** button to the Insights tab
      in `SocialForm`/`WebForm` that pre-fills the textareas for you to edit.
      Human-in-the-loop: the model drafts, you approve. *(Use the latest Claude model.)*
- [ ] **Anomaly flagging.** You already have the projection math in
      `src/lib/projection.js`. Extend it to flag metrics that deviate sharply from
      trend ("Instagram engagement is 40% below pace") and surface them as badges.
- [ ] **Goals / targets.** A `targets` table (metric, quarter, agency, goal value).
      Render pace-to-goal on KPI cards and Trends — reuse the existing projection
      engine to answer "will we hit it?"
- [ ] **Year-over-year.** Today it's quarter-over-quarter only. With a few quarters
      of history, add YoY deltas (staffing demand is seasonal — this matters).

### Phase 3 — Distribution & delivery · `M` · **Impact: M–H**
*Make the report come to people instead of waiting to be opened. Leans on your existing M365 / Canva stack.*

- [ ] **Scheduled email digest (Outlook / M365).** End-of-quarter summary + a
      weekly "pace check" mid-quarter, straight to stakeholders' inboxes.
- [ ] **Auto-generated PDF / Canva deck.** One-click branded export per agency per
      quarter for client/leadership sharing — replaces the old slide-deck workflow
      the README mentions you moved away from.
- [ ] **Teams channel digest.** Post the quarter summary (and anomaly alerts) to a Teams channel.
- [ ] **Shareable snapshot links.** State already lives in the URL; add signed,
      read-only share links (or frozen point-in-time snapshots) so an external
      number can't shift after you've shared it.

### Phase 4 — Breadth & depth · `M–L` · **Impact: M**
*Once the core loop is automated, widen what "the report" covers.*

- [ ] **More channels:** Google Search Console (SEO queries/impressions/clicks/position)
      and Google Business Profile — both high-value for staffing-agency web presence.
- [ ] **Cross-agency benchmarking.** You have three comparable agencies — a view that
      ranks them side-by-side is uniquely useful and you already hold all the data.
- [ ] **Campaign tagging.** Tag posts/pages to campaigns; measure campaign-level reach
      and ROI rather than just quarter totals.
- [ ] **Outcome tie-in.** `web_kpis.form_submissions` is a proxy for leads. Connecting
      it to real placements (CRM) turns a marketing dashboard into a marketing-to-revenue one.
- [ ] **Multi-user + audit.** Today it's a single magic-link admin. Add editor vs.
      viewer roles and a change log (who edited what, when) — important once data is
      both auto-synced and hand-corrected.

---

## If you only do three things

1. **Phase 0 daily-snapshot cron** — smallest effort, immediately fixes the
   projection-history gaps. Proves the backend-job pattern.
2. **Phase 1: GA4 → Web report** — easiest API, zero-touch Web report, deletes a
   whole category of quarterly data entry.
3. **Phase 2: AI-drafted insights** — the data's already structured; this turns
   the most time-consuming part of the close (writing the narrative ×4 ×3) into a
   review step.

Those three are independently shippable, each saves real time, and together they
prove the entire v3 thesis end-to-end before you take on the heavier
Meta/LinkedIn ingestion.

---

## Risks & realities (so none of this surprises you later)

- **API access reviews are the long pole.** Meta and especially LinkedIn require
  app review and specific permission scopes — start those applications early;
  they gate Phase 1.
- **OAuth token lifecycle** (refresh, expiry, revocation) is fiddly and must be
  server-side only. The `integration_credentials` table must never be readable
  by the anon key.
- **The static→server shift is real.** It's the right call, but it adds a
  deployment surface (edge functions, secrets, cron) the project doesn't have today.
- **Keep the manual override.** Auto-sync should *augment*, not replace, the
  admin. Source platforms restate history and have outages — a human must always
  be able to correct a number, and a re-sync must not silently overwrite that.
- **Cost is modest but nonzero:** API quotas, Claude API tokens for insight
  drafting, and edge-function invocations. All small at this volume; worth a line
  in the budget.

---

## Effort × impact at a glance

| Initiative | Phase | Effort | Impact | Notes |
|---|---|---|---|---|
| Daily snapshot cron | 0 | S | H | Do first; fixes existing gap |
| Job runner + credential store | 0 | S–M | (enabler) | Unlocks all ingestion |
| GA4 → Web report | 1 | M | H | Easiest source, zero-touch Web |
| Meta → FB/IG | 1 | L | H | Needs app review |
| LinkedIn ingestion | 1 | L | H | Strictest API review — last |
| AI-drafted insights | 2 | M | H | Reuses existing deltas/projections |
| Anomaly flagging | 2 | S–M | M | Extends `projection.js` |
| Goals / targets | 2 | M | M–H | New `targets` table |
| Email / Teams / PDF delivery | 3 | M | M–H | Uses your M365 + Canva stack |
| Shareable snapshot links | 3 | S–M | M | URL state already exists |
| Search Console / GBP | 4 | M | M | SEO breadth |
| Cross-agency benchmarking | 4 | M | M | Data already on hand |
| Campaign tagging / outcomes | 4 | M–L | M | Marketing → revenue |
| Multi-user + audit | 4 | M | M | Matters once auto + manual mix |

---

*Living document — reprioritize as API approvals land and the close-the-quarter
workflow tightens up.*
