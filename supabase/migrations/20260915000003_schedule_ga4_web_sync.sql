-- Weekly trigger for the ga4-web-sync edge function.
--
-- APPLY THIS LAST. The whole point of the function's dry-run mode is to check
-- GA4's numbers against the GA4 UI before anything writes on a schedule. Deploy
-- the function, run it with {"dry_run": true}, confirm the figures and the page
-- labels, and only then apply this migration. Nothing else depends on it.
--
-- Why pg_cron rather than a GitHub Action: pg_cron is already installed and
-- already running capture-projection-snapshots, so this is a second row in a
-- scheduler that is checked in one place. It also keeps the service-role key
-- inside the platform instead of in a CI secret store, and there is no second
-- deploy path to keep working.
--
-- pg_cron cannot make an HTTP call on its own, so pg_net does the POST. The
-- function URL and the service-role key live in Supabase Vault rather than in
-- the cron command, because cron.job.command is plain text that anyone with a
-- database connection can read. Set them once, by hand, from the SQL editor:
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/ga4-web-sync',
--     'ga4_sync_function_url');
--   select vault.create_secret('<service-role key>', 'ga4_sync_service_key');
--
-- Neither value belongs in this file or anywhere else in the repository.

create extension if not exists pg_net;

-- SECURITY DEFINER so the scheduler can read the vault without the vault being
-- readable by anyone else. It returns pg_net's request id; the response lands
-- in net._http_response, and the run's own outcome lands in ingestion_runs,
-- which is the record worth reading.
create or replace function public.trigger_ga4_web_sync()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  key    text;
  req_id bigint;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'ga4_sync_function_url';
  select decrypted_secret into key
    from vault.decrypted_secrets where name = 'ga4_sync_service_key';

  if fn_url is null or key is null then
    raise exception
      'trigger_ga4_web_sync: vault secrets ga4_sync_function_url and ga4_sync_service_key must both be set';
  end if;

  select net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'content-type',  'application/json',
                 'authorization', 'Bearer ' || key
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into req_id;

  return req_id;
end;
$$;

revoke all on function public.trigger_ga4_web_sync() from public, anon, authenticated;

-- Mondays at 15:00 UTC — midday in Halifax, so the week opens with current
-- figures. The lateness in the day is deliberate: the run reports through
-- yesterday, and a Halifax Sunday only closes at 03:00 UTC Monday, so this
-- leaves GA4 twelve hours to finish processing it. GA4 can still be settling
-- the most recent day; a quarter-to-date total that is fractionally light on
-- its last day corrects itself on the next run, and the close-out window in
-- quartersToSync() is what makes sure the final week of a quarter is not the
-- one left short.
select cron.schedule(
  'ga4-web-sync',
  '0 15 * * 1',
  $$select public.trigger_ga4_web_sync();$$
);
