-- Audience demographics for the Paid Media report, sourced from LinkedIn
-- Campaign Manager's Demographics export (job function, seniority, industry,
-- company size, location, company). One row per dimension+segment, scoped to
-- the report (quarter), since Campaign Manager reports demographics at the
-- account level for a date range. CTR and share-of-impressions are derived.
-- Public-read / authenticated-write, matching the other paid_media_* tables.
create table if not exists public.paid_media_demographics (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.social_reports(id) on delete cascade,
  dimension   text not null,
  segment     text not null default '',
  sort_order  integer not null default 0,
  impressions integer,
  clicks      integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.paid_media_demographics enable row level security;

create policy "public read" on public.paid_media_demographics
  for select to public using (true);
create policy "auth write" on public.paid_media_demographics
  for all to public using (auth.role() = 'authenticated');

create index if not exists paid_media_demographics_report_idx
  on public.paid_media_demographics (report_id, dimension, sort_order);
