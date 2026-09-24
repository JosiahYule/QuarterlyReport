-- Move the Web admin save into one transactional function, and make it safe
-- for a partial writer.
--
-- Two problems, one fix.
--
-- 1. Atomicity. WebForm saves the way SocialForm used to: upsert the report
--    row, then delete-every-row-and-reinsert each of four child tables, as
--    nine separate statements from the browser with nothing wrapping them. A
--    failure partway -- dropped connection, constraint, RLS rejection -- left
--    the tables it had already reached empty on the server while the browser
--    still held the values. 20260914000000 fixed exactly this for social and
--    did not touch web. A PL/pgSQL function body runs in a single
--    transaction, so it commits every table or none of them.
--
-- 2. Partial writes. The coming GA4 job supplies sessions, users, engagement
--    rate, average engagement time, channels and pages. It does NOT supply
--    the summary bullet, the four insight blocks, or any KPI GA4 has no
--    equivalent for. Delete-then-insert cannot express that: everything the
--    caller omits becomes NULL or ''. So this function merges on key
--    PRESENCE instead --
--
--      key absent   -> column left exactly as it was
--      key present  -> column written, including an explicit null to clear it
--
--    which is what makes a weekly automated run safe to sit alongside hand
--    entry. Put the guarantee here rather than in the caller and it is
--    structural: it holds for the cron job, for the admin form, and for
--    anything written later, whether or not the author remembers the rule.
--
--    Lists (channels, pages) merge at the list level, not per row: sending
--    "channels" replaces the whole set, omitting it leaves the set alone.
--    There is no stable identity to merge a channel row on -- name is the
--    only candidate and it is exactly what GA4 spells differently -- so a
--    partial list merge would silently accumulate duplicates.
--
-- The admin form keeps its current behaviour by sending every key on every
-- save, so a field the user clears still clears.

-- web_kpis and web_insights have always been one-row-per-report by
-- convention: the form deletes before inserting, and both readers take
-- `[0]`. Nothing enforced it, so a half-completed save could leave two rows
-- and a reader would silently pick one. The merge below also needs a conflict
-- target. The unique index gives both, and covers the foreign key at the same
-- time (the performance advisor has been asking for these).
alter table public.web_kpis
  drop constraint if exists web_kpis_report_id_key;
alter table public.web_kpis
  add constraint web_kpis_report_id_key unique (report_id);

alter table public.web_insights
  drop constraint if exists web_insights_report_id_key;
alter table public.web_insights
  add constraint web_insights_report_id_key unique (report_id);

-- Plain indexes for the two list children's foreign keys, same reason.
create index if not exists web_channels_report_id_idx on public.web_channels (report_id);
create index if not exists web_pages_report_id_idx    on public.web_pages    (report_id);

create or replace function public.save_web_report(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  rid uuid;
  k   jsonb;
  i   jsonb;
begin
  if payload->>'agency' is null or payload->>'quarter' is null or payload->>'year' is null then
    raise exception 'save_web_report: agency, quarter and year are all required';
  end if;

  -- ── Report row ─────────────────────────────────────────────────
  -- Keyed on (agency, quarter, year). Without the year this would overwrite
  -- the same-suffix quarter from the previous fiscal year.
  insert into web_reports (agency, quarter, year, summary_bullet)
  values (
    payload->>'agency',
    payload->>'quarter',
    payload->>'year',
    coalesce(payload->>'summary_bullet', '')
  )
  on conflict (agency, quarter, year) do update
     set summary_bullet = case
           when payload ? 'summary_bullet' then coalesce(payload->>'summary_bullet', '')
           else web_reports.summary_bullet
         end,
         updated_at = now()
  returning id into rid;

  -- ── KPIs ───────────────────────────────────────────────────────
  -- Merged column by column. A caller that supplies sessions but not
  -- form_submissions leaves the hand-entered form_submissions standing.
  k := payload->'kpis';
  if k is not null and jsonb_typeof(k) = 'object' then
    insert into web_kpis (
      report_id, sessions, users, engagement_rate,
      avg_engagement_time_sec, actions, form_submissions
    )
    values (
      rid,
      (k->>'sessions')::int,
      (k->>'users')::int,
      (k->>'engagement_rate')::numeric,
      (k->>'avg_engagement_time_sec')::int,
      (k->>'actions')::int,
      (k->>'form_submissions')::int
    )
    on conflict (report_id) do update set
      sessions = case when k ? 'sessions'
                   then (k->>'sessions')::int else web_kpis.sessions end,
      users = case when k ? 'users'
                   then (k->>'users')::int else web_kpis.users end,
      engagement_rate = case when k ? 'engagement_rate'
                   then (k->>'engagement_rate')::numeric else web_kpis.engagement_rate end,
      avg_engagement_time_sec = case when k ? 'avg_engagement_time_sec'
                   then (k->>'avg_engagement_time_sec')::int else web_kpis.avg_engagement_time_sec end,
      actions = case when k ? 'actions'
                   then (k->>'actions')::int else web_kpis.actions end,
      form_submissions = case when k ? 'form_submissions'
                   then (k->>'form_submissions')::int else web_kpis.form_submissions end;
  end if;

  -- ── Channels ───────────────────────────────────────────────────
  if payload ? 'channels' then
    delete from web_channels where report_id = rid;
    insert into web_channels (
      report_id, sort_order, name, sessions, share_of_traffic, engagement_rate
    )
    select
      rid, (ord - 1)::int, coalesce(c->>'name', ''),
      (c->>'sessions')::int,
      (c->>'share_of_traffic')::numeric,
      (c->>'engagement_rate')::numeric
    from jsonb_array_elements(coalesce(payload->'channels', '[]'::jsonb))
      with ordinality as t(c, ord);
  end if;

  -- ── Pages ──────────────────────────────────────────────────────
  if payload ? 'pages' then
    delete from web_pages where report_id = rid;
    insert into web_pages (
      report_id, sort_order, key, page_views, bounce_rate, avg_time_on_page_sec
    )
    select
      rid, (ord - 1)::int, coalesce(p->>'key', ''),
      (p->>'page_views')::int,
      (p->>'bounce_rate')::numeric,
      (p->>'avg_time_on_page_sec')::int
    from jsonb_array_elements(coalesce(payload->'pages', '[]'::jsonb))
      with ordinality as t(p, ord);
  end if;

  -- ── Insights ───────────────────────────────────────────────────
  -- All four are hand-written and no ingestion job supplies them, so this
  -- block is the one most likely to be reached by a caller that omits it.
  -- Merged per field for the same reason as the KPIs.
  i := payload->'insights';
  if i is not null and jsonb_typeof(i) = 'object' then
    insert into web_insights (report_id, working, not_working, actions, next_quarter)
    values (
      rid,
      coalesce(i->>'working', ''),
      coalesce(i->>'not_working', ''),
      coalesce(i->>'actions', ''),
      coalesce(i->>'next_quarter', '')
    )
    on conflict (report_id) do update set
      working = case when i ? 'working'
                  then coalesce(i->>'working', '') else web_insights.working end,
      not_working = case when i ? 'not_working'
                  then coalesce(i->>'not_working', '') else web_insights.not_working end,
      actions = case when i ? 'actions'
                  then coalesce(i->>'actions', '') else web_insights.actions end,
      next_quarter = case when i ? 'next_quarter'
                  then coalesce(i->>'next_quarter', '') else web_insights.next_quarter end;
  end if;

  return rid;
end;
$$;

comment on function public.save_web_report(jsonb) is
  'Saves a web report -- report row plus its four child tables -- in one transaction. Merges on key presence: an omitted key leaves the stored value alone, so a partial writer such as the GA4 ingestion job cannot blank hand-entered fields.';

-- The report pages only read; nothing anonymous should be able to call this.
-- service_role is granted because the scheduled ingestion job runs as it.
revoke all on function public.save_web_report(jsonb) from public, anon;
grant execute on function public.save_web_report(jsonb) to authenticated, service_role;
