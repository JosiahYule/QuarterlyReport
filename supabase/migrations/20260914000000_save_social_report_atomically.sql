-- The admin save used to run from the browser as ten separate statements:
-- upsert the report row, then for each of eight child tables delete every row
-- and insert the new ones. Nothing wrapped them. A failure partway — a dropped
-- connection, a constraint, an RLS rejection — left the tables it had already
-- reached empty on the server while the browser still held the values. Closing
-- the tab at that point lost the quarter.
--
-- This moves the whole save into one function. A PL/pgSQL function body runs
-- inside a single transaction, so it either commits every table or none of
-- them, and a mid-save failure now leaves the previous quarter untouched.
--
-- SECURITY INVOKER (the default, stated here for the avoidance of doubt): the
-- function writes with the caller's own rights, so the existing
-- "auth write" policy — auth.role() = 'authenticated' — still gates every
-- statement exactly as it gated the browser's writes. The function buys
-- atomicity and nothing else; it grants no access the admin did not have.

create or replace function public.save_social_report(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  rid uuid;
begin
  if payload->>'agency' is null or payload->>'quarter' is null or payload->>'year' is null then
    raise exception 'save_social_report: agency, quarter and year are all required';
  end if;

  -- Keyed on (agency, quarter, year). Without the year this would overwrite
  -- the same-suffix quarter from the previous fiscal year.
  insert into social_reports (agency, quarter, year, editors_note)
  values (
    payload->>'agency',
    payload->>'quarter',
    payload->>'year',
    coalesce(payload->>'editors_note', '')
  )
  on conflict (agency, quarter, year)
    do update set editors_note = excluded.editors_note, updated_at = now()
  returning id into rid;

  -- ── KPIs ───────────────────────────────────────────────────────
  delete from social_kpis where report_id = rid;
  insert into social_kpis (
    report_id, posts, impressions, shares, reactions,
    followers, link_clicks, comments, avg_engagement_rate, followers_start
  )
  select
    rid,
    (k->>'posts')::int, (k->>'impressions')::int, (k->>'shares')::int,
    (k->>'reactions')::int, (k->>'followers')::int, (k->>'link_clicks')::int,
    (k->>'comments')::int, (k->>'avg_engagement_rate')::numeric,
    (k->>'followers_start')::int
  from jsonb_extract_path(payload, 'kpis') k
  where k is not null and jsonb_typeof(k) = 'object';

  -- ── Platforms ──────────────────────────────────────────────────
  delete from social_platforms where report_id = rid;
  insert into social_platforms (
    report_id, sort_order, name, followers, engagement_rate, page_reach, page_clicks, note
  )
  select
    rid, (ord - 1)::int, coalesce(p->>'name', ''),
    (p->>'followers')::int, (p->>'engagement_rate')::numeric,
    (p->>'page_reach')::int, (p->>'page_clicks')::int, coalesce(p->>'note', '')
  from jsonb_array_elements(coalesce(payload->'platforms', '[]'::jsonb)) with ordinality as t(p, ord);

  -- ── Top posts ──────────────────────────────────────────────────
  delete from social_top_posts where report_id = rid;
  insert into social_top_posts (report_id, platform, title, impressions, likes, shares)
  select
    rid, p->>'platform', coalesce(p->>'title', ''),
    coalesce((p->>'impressions')::int, 0),
    coalesce((p->>'likes')::int, 0),
    coalesce((p->>'shares')::int, 0)
  from jsonb_array_elements(coalesce(payload->'top_posts', '[]'::jsonb)) p;

  -- ── All posts ──────────────────────────────────────────────────
  -- impressions and engagements are NOT NULL DEFAULT 0, so a row left blank
  -- in the form lands as 0 rather than failing the whole save.
  delete from social_posts where report_id = rid;
  insert into social_posts (
    report_id, post_name, post_date, post_time, platforms, impressions, engagements, url, notes
  )
  select
    rid, p->>'post_name', (p->>'post_date')::date, p->>'post_time', p->>'platforms',
    coalesce((p->>'impressions')::int, 0),
    coalesce((p->>'engagements')::int, 0),
    p->>'url', p->>'notes'
  from jsonb_array_elements(coalesce(payload->'posts', '[]'::jsonb)) p;

  -- ── Paid media campaigns, then their ads ───────────────────────
  -- Campaign ids come from the client so ads can reference their campaign
  -- without reading back inserted ids. Deleting a campaign cascades to its
  -- ads, demographics and click paths, so campaigns go first.
  delete from paid_media_campaigns where report_id = rid;
  insert into paid_media_campaigns (
    id, report_id, sort_order, name, objective, platform, budget, start_date, end_date
  )
  select
    (c->>'id')::uuid, rid, (ord - 1)::int,
    coalesce(c->>'name', ''), coalesce(c->>'objective', ''), coalesce(c->>'platform', ''),
    (c->>'budget')::numeric, (c->>'start_date')::date, (c->>'end_date')::date
  from jsonb_array_elements(coalesce(payload->'campaigns', '[]'::jsonb)) with ordinality as t(c, ord);

  insert into paid_media_ads (
    id, campaign_id, sort_order, name, impressions, reach, clicks, cpc,
    conversions, engagement_rate, status
  )
  select
    (a->>'id')::uuid, (a->>'campaign_id')::uuid, coalesce((a->>'sort_order')::int, 0),
    coalesce(a->>'name', ''),
    (a->>'impressions')::int, (a->>'reach')::int, (a->>'clicks')::int, (a->>'cpc')::numeric,
    (a->>'conversions')::int, (a->>'engagement_rate')::numeric,
    coalesce(nullif(a->>'status', ''), 'active')
  from jsonb_array_elements(coalesce(payload->'ads', '[]'::jsonb)) a;

  -- ── Demographics ───────────────────────────────────────────────
  delete from paid_media_demographics where report_id = rid;
  insert into paid_media_demographics (
    report_id, campaign_id, dimension, segment, is_other, sort_order, impressions, clicks
  )
  select
    rid, (d->>'campaign_id')::uuid, d->>'dimension', coalesce(d->>'segment', ''),
    coalesce((d->>'is_other')::boolean, false), coalesce((d->>'sort_order')::int, 0),
    (d->>'impressions')::int, (d->>'clicks')::int
  from jsonb_array_elements(coalesce(payload->'demographics', '[]'::jsonb)) d;

  -- ── Click paths ────────────────────────────────────────────────
  delete from paid_media_click_paths where report_id = rid;
  insert into paid_media_click_paths (
    report_id, campaign_id, sort_order, steps, sessions, conversions, is_other
  )
  select
    rid, (p->>'campaign_id')::uuid, coalesce((p->>'sort_order')::int, 0),
    coalesce(p->'steps', '[]'::jsonb),
    (p->>'sessions')::int, (p->>'conversions')::int,
    coalesce((p->>'is_other')::boolean, false)
  from jsonb_array_elements(coalesce(payload->'click_paths', '[]'::jsonb)) p;

  -- ── Insights ───────────────────────────────────────────────────
  delete from social_insights where report_id = rid;
  insert into social_insights (report_id, working, not_working, actions, next_quarter)
  select
    rid,
    coalesce(i->>'working', ''), coalesce(i->>'not_working', ''),
    coalesce(i->>'actions', ''), coalesce(i->>'next_quarter', '')
  from jsonb_extract_path(payload, 'insights') i
  where i is not null and jsonb_typeof(i) = 'object';

  return rid;
end;
$$;

comment on function public.save_social_report(jsonb) is
  'Saves a whole social report — report row plus all eight child tables — in one transaction. Replaces the browser-side delete-then-insert sequence, which could half-complete and lose a quarter''s data.';

-- The report pages only read; nothing anonymous should be able to call this.
revoke all on function public.save_social_report(jsonb) from public, anon;
grant execute on function public.save_social_report(jsonb) to authenticated;
