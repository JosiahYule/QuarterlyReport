-- Remove the GA4 ingestion scaffolding. The Website report is hand-entered.
--
-- The automated pull was retired in "Remove GA4 ingestion; the Website report
-- is hand-entered again", which deleted the edge function and the admin's sync
-- banner but deliberately left these objects standing, because dropping
-- production tables is not something to do on the way past. This finishes it.
--
-- Why finish it rather than leave them inert. ga4_install_credential is a
-- SECURITY DEFINER function that writes to Vault, reachable by the service
-- role, gated on a single-use token that was still outstanding -- a live
-- install endpoint for a system that no longer exists. The rest is clutter,
-- and clutter that looks half-configured is what made the Website report hard
-- to reason about in the first place.
--
-- NOT dropped, because hand-entry depends on them:
--
--   save_web_report(jsonb)    WebForm calls it on every save. One RPC, one
--                             transaction, all five tables or none.
--   web_reports.year          Unique on (agency, quarter, year). Without it a
--                             hand-saved Q1 overwrites the previous fiscal
--                             year's Q1 and takes its channels and pages with
--                             it.
--   web_kpis_report_id_key    save_web_report's ON CONFLICT targets.
--   web_insights_report_id_key
--
-- The edge function deployment itself is not a database object and outlives
-- this migration. Remove it with `supabase functions delete ga4-web-sync`.
-- Until then it is inert: no schedule triggers it, and with the credential
-- gone it fails on its first step.

-- ─── Functions ────────────────────────────────────────────────────
-- Dropped before the table they read, though order does not strictly matter:
-- PL/pgSQL bodies are not dependency-tracked, so neither blocks the other.
drop function if exists public.ga4_install_credential(text, text);
drop function if exists public.integration_secret_get(text);
drop function if exists public.integration_secret_set(text, text);

-- Never applied to this database -- 20260915000003 was deleted before it ran
-- anywhere -- but named here so a database that did get it ends up in the
-- same state as one that did not.
drop function if exists public.trigger_ga4_web_sync();

-- ─── Tables ───────────────────────────────────────────────────────
-- No foreign keys point at either, so no CASCADE is needed and none is used:
-- a drop that would take something else with it should fail loudly instead.
--
-- integration_config held the GA4 property IDs. They are identifiers rather
-- than secrets, and they are recoverable from the GA4 admin screen, so they
-- are not preserved here. Nothing outside the deleted job ever read them.
drop table if exists public.integration_config;

-- ingestion_runs logged each run's outcome for the admin's sync banner. Both
-- the job and the banner are gone, and its one row records the credential
-- install that failed on 15 September.
drop table if exists public.ingestion_runs;

-- ─── Vault ────────────────────────────────────────────────────────
-- The single-use install token, and the service-account credential if one was
-- ever stored (on this database the install never succeeded, so it was not).
delete from vault.secrets where name in ('ga4_install_token', 'ga4_service_account');
