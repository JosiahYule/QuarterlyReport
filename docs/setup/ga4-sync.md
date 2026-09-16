# Finish the GA4 Website sync

## What was confirmed in the repository

The deployment note in [PR #163](https://github.com/JosiahYule/QuarterlyReport/pull/163),
merged September 15, 2026, says version 1 of `ga4-web-sync` was deployed with JWT
verification enabled, `GA4_SERVICE_ACCOUNT_JSON` was not yet set, and the cron
migration was intentionally not applied. This describes the state at that deploy;
it does not prove what has changed in the Supabase dashboard since then.

The data path is GA4 Data API → Supabase Edge Function → `save_web_report` → Website
report. Cloudflare deploys the dashboard; it does **not** deploy the Supabase
function, install database migrations, or configure Google credentials.

## 1. Check Google access

In the Google Cloud project that owns the service account:

- Enable **Google Analytics Data API** (`analyticsdata.googleapis.com`).
- Create/download a service-account JSON key if one does not already exist.
- In each GA4 property's **Admin → Property access management**, add that JSON
  file's `client_email` as a **Viewer**. A Google Cloud IAM role alone does not
  grant access to a GA4 property.
- Copy the numeric **Property ID**, not the `G-...` Measurement ID from a data stream.

See Google's [Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries).

## 2. Check function secrets

In Supabase → Edge Functions → Secrets, set:

| Name | Value |
| --- | --- |
| `GA4_SERVICE_ACCOUNT_JSON` | Complete JSON key file contents, including braces, `client_email`, and `private_key` |
| `GA4_PROPERTY_ISL` | Integrated Staffing's numeric Property ID |
| `GA4_PROPERTY_AS` | Accountant Staffing's numeric Property ID, when ready |
| `GA4_PROPERTY_ADS` | Administrative Staffing's numeric Property ID, when ready |

Do not add another layer of quotes around the JSON or replace it with a filename.
Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.
Do not put service credentials in `VITE_*`, GitHub files, or the browser.

A default `{}` run attempts configured brands. An explicit `agencies` list must
have a Property ID for every requested brand; missing properties cause an error.

## 3. Check database prerequisites

These three September 15 migrations must already be applied, in order:

1. `20260915000000_add_year_to_web_reports.sql`
2. `20260915000001_save_web_report_atomically.sql`
3. `20260915000002_create_ingestion_runs.sql`

(The schedule is a separate fourth migration and comes later.) Inspect the
migration history first; do not blindly rerun applied migrations.

Read-only checks in the SQL editor:

```sql
select to_regclass('public.ingestion_runs') as run_log,
       to_regprocedure('public.save_web_report(jsonb)') as save_function;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'web_reports'
  and column_name = 'year';

select conname from pg_constraint
where conrelid = 'public.web_reports'::regclass
  and conname = 'web_reports_agency_quarter_year_key';
```

If a prerequisite is missing, apply only its unapplied migrations before a live
write. A dry run tests Google and the mapping; it does not test database writes.

## 4. Deploy and preview the intended quarter

Deploy the updated function from this repository:

```bash
supabase functions deploy ga4-web-sync --project-ref tmqotmpacguusianlpcg
```

The project reference comes from the repository's migration script; verify that
this is still the dashboard's Supabase project before deploying.

This implementation retains `verify_jwt = true`. Invoke with the project's
**legacy service_role JWT** in `Authorization: Bearer <service-role JWT>`.
The public anon key and a signed-in user's JWT are intentionally rejected by the
handler because this endpoint writes using elevated database privileges. The
newer `sb_secret_...` key is not a JWT and is not the credential for this deployment.
See Supabase's [authorization header documentation](https://supabase.com/docs/guides/functions/auth-headers).
Do not disable JWT verification as a workaround for a 401.

In the Supabase function tester, select POST, configure that authorization header,
and use this body for the report that ended August 31:

```json
{"dry_run": true, "agencies": ["isl"], "quarter": "q4", "year": "2026"}
```

Expected range: **2026-06-01 through 2026-08-31**. Compare with GA4 using that same
property and date range. Check total users vs active users and average engagement
time **per session** vs average engagement time **per active user** when comparing
KPI labels. Confirm returned page paths match the configured labels in `mapping.ts`.
Page labels and merged page-rate calculations still need comparison with real data;
passing mocked tests does not validate them against this GA4 property.

For the current quarter, omit `quarter` and `year`:

```json
{"dry_run": true, "agencies": ["isl"]}
```

On September 16 that means September 1–15, **not June–August**. The automatic
previous-quarter close-out lasts only the first 14 days of the new quarter.
Explicit quarter/year is how to repair or backfill an older report after that window.

## 5. Save once, then schedule

After checking the preview, repeat the same request with `"dry_run": false`.
The sync updates GA4 KPIs/channels/pages, preserving hand-written insights,
summary, campaign clicks, and form submission counts. Empty or wholly unmatched
page results leave stored pages alone. Inspect the Website report and the latest
`ingestion_runs` row to verify the write.

Only then configure Vault entries `ga4_sync_function_url` and
`ga4_sync_service_key` and apply the unapplied
`20260915000003_schedule_ga4_web_sync.sql` migration. The key is the same legacy
service_role JWT used in the successful test. Its setup comments contain the SQL.
The schedule runs Mondays at **15:00 UTC** (12:00 Halifax during daylight time,
11:00 Halifax during standard time).

Read-only checks, after the relevant tables/extensions exist:

```sql
-- Secret names only, never decrypted values.
select name from vault.secrets
where name in ('ga4_sync_function_url', 'ga4_sync_service_key');

select jobid, jobname, schedule, active from cron.job
where jobname = 'ga4-web-sync';

select agency, quarter, year, status, message, started_at, finished_at
from public.ingestion_runs where source = 'ga4'
order by started_at desc limit 12;

select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'ga4-web-sync')
order by start_time desc limit 5;

select id, status_code, timed_out, error_msg, created
from net._http_response order by created desc limit 10;
```

Cron success means the HTTP request was queued, not that GA4 succeeded. Check the
HTTP response and `ingestion_runs` as well. HTTP errors rejected by the gateway
never reach the function and therefore cannot create an ingestion log row.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `GA4_SERVICE_ACCOUNT_JSON is not set` | Add that exact secret name to the function's Supabase project |
| JSON/private-key parsing error | Paste the full unmodified service-account JSON file |
| Function returns 401 before any log row | Authorization header, legacy service_role JWT, correct project; not `sb_secret_...` or anon |
| Google token exchange fails | Service account is active; JSON key belongs to it and has not been revoked |
| GA4 returns 403 | Enable the Data API in the key's Google Cloud project and grant Viewer on the specific GA4 property |
| GA4 returns 400/404 | Numeric Property ID and the exact API error; verify requested dimensions/metrics for that property |
| Dry run works; save fails | Required database migrations, `save_web_report` grants, schema errors in the response |
| No run shows in admin | Check function invocation and cron; gateway failures happen before logging |
| Q4 does not change | Use explicit `quarter: "q4", year: "2026"`; the current-quarter schedule is now Q1 |
| Some brands work but HTTP is 500 | Inspect each result; successful brands are saved and failures remain individually reported |

Tests exercise the real handler with an ephemeral signing key and mocked Google
and Supabase responses. Live Google access, property-specific compatibility,
database state, and the scheduler require the connected Supabase environment.
