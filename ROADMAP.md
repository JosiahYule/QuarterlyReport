# Quarterly Report roadmap

*Updated 24 September 2026.*

## Where it stands

A static React app on Cloudflare Pages, reading Supabase live. Four views per agency (Social Media, Website, Paid Media, Trends) and an admin for data entry.

The foundations the earlier roadmap asked for are in place:

- **Scheduled snapshots.** A pg_cron job captures every agency's KPIs daily, so the Trends projections no longer depend on who happens to open the page.
- **Atomic saves.** Each report saves in one database transaction, so a failure can't leave a quarter half-written.
- **Access control.** Edits, and reads of contact-form submissions, require a signed-in email on the `admins` list. The public key can no longer write snapshots or projection audits.
- **Reports keyed by fiscal year**, with every quarter since Q1 2025–26 reachable and links that keep pointing at the same quarter.
- **A rebuildable database.** `supabase/migrations/` is the complete history and replays to the live schema.

## Decided against

- **Automated GA4 ingestion.** Built and removed in September 2026. It needed a Google Cloud service account, a credential store and a scheduled job to save a once-a-quarter read-off from the GA4 interface. The Website report is hand-entered; the README lists where each figure comes from.
- **The admin Plan tab** (idea board, weekly calendar, posting suggestions). Removed in September 2026 because it wasn't in use.

## Next, in priority order

1. **Year-over-year comparison** · *S–M*. Staffing demand is seasonal, so the same quarter last year is a fairer comparison than the quarter just before. It was blocked on reports being keyed by year and old quarters being reachable; both are done. From Q1 2026–27, every agency has a year-ago quarter to compare with.
2. **Follower growth** · *S*. `social_kpis.followers_start` exists and the save function writes it, but the admin form has no field for it and the report doesn't show it. Adding both turns an end-of-quarter follower count into net growth.
3. **AI-drafted insights** · *M*. Draft the four insight blocks from the quarter's deltas and projections with the Claude API, for you to edit and approve. The data is already structured. The cost is a server-side function holding an API key: the same kind of machinery that made GA4 ingestion not worth it, so it should earn its place by the time it saves.
4. **Goals and targets** · *M*. A `targets` table (agency, quarter, metric, goal) and pace-to-goal on the KPI cards, reusing the projection model.
5. **Delivery** · *M*. A PDF export or an end-of-quarter email, so the report reaches people who don't open dashboards.

## Ideas, not scheduled

- Meta and LinkedIn ingestion. Both need app review and OAuth token handling, which is heavier than GA4 was. Worth revisiting only if data entry becomes the bottleneck.
- Google Search Console and Google Business Profile as extra channels.
- Side-by-side benchmarking of the three agencies.
- Tagging posts and pages to campaigns, and tying form submissions to placements.
- Editor and viewer roles with a change log. The `admins` table is the starting point.

## Housekeeping

- The `ga4-web-sync` edge function is still deployed. It can do nothing without its deleted credential, but it answers requests made with the public key. Delete it under **Edge Functions** in the Supabase dashboard.
