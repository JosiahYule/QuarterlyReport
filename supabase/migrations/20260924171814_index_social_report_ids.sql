-- Two findings from the performance advisor.

-- The admins policy called auth.jwt() once per row. Wrapped in a subquery it
-- is evaluated once per statement, like every other policy's is_admin() call.
alter policy "self read" on public.admins
  using (email = lower((select auth.jwt()) ->> 'email'));

-- The social_* child tables had no index on report_id, the column every save
-- deletes by and every report read joins on. The web_* tables already have one.
create index if not exists social_kpis_report_id_idx on public.social_kpis (report_id);
create index if not exists social_platforms_report_id_idx on public.social_platforms (report_id);
create index if not exists social_top_posts_report_id_idx on public.social_top_posts (report_id);
create index if not exists social_posts_report_id_idx on public.social_posts (report_id);
create index if not exists social_insights_report_id_idx on public.social_insights (report_id);
