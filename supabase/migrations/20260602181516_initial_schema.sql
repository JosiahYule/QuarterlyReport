-- Recovered from the live database's migration history
-- (supabase_migrations.schema_migrations). It was applied on 2 June 2026 but
-- never committed, which left the repo unable to rebuild the core report
-- tables. The statements below are the ones that ran, verbatim.

-- Social reports
create table public.social_reports (
  id          uuid primary key default gen_random_uuid(),
  agency      text not null check (agency in ('isl', 'as', 'ads')),
  quarter     text not null check (quarter in ('q1', 'q2', 'q3', 'q4')),
  editors_note text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency, quarter)
);

create table public.social_kpis (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.social_reports(id) on delete cascade,
  posts               integer,
  impressions         integer,
  shares              integer,
  reactions           integer,
  followers           integer,
  link_clicks         integer,
  comments            integer,
  avg_engagement_rate numeric(8,3)
);

create table public.social_platforms (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.social_reports(id) on delete cascade,
  sort_order      integer not null default 0,
  name            text not null,
  followers       integer,
  engagement_rate numeric(8,3),
  page_reach      integer,
  page_clicks     integer,
  note            text not null default ''
);

create table public.social_top_posts (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.social_reports(id) on delete cascade,
  platform    text not null check (platform in ('linkedin', 'facebook', 'instagram')),
  title       text not null,
  impressions integer not null default 0,
  likes       integer not null default 0,
  shares      integer not null default 0
);

create table public.social_posts (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.social_reports(id) on delete cascade,
  post_name   text,
  post_date   date,
  platforms   text,
  impressions integer not null default 0,
  engagements integer not null default 0,
  url         text,
  notes       text
);

create table public.social_insights (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.social_reports(id) on delete cascade,
  working      text not null default '',
  not_working  text not null default '',
  actions      text not null default '',
  next_quarter text not null default ''
);

-- Web reports
create table public.web_reports (
  id             uuid primary key default gen_random_uuid(),
  quarter        text not null check (quarter in ('q1', 'q2', 'q3', 'q4')),
  summary_bullet text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (quarter)
);

create table public.web_kpis (
  id                    uuid primary key default gen_random_uuid(),
  report_id             uuid not null references public.web_reports(id) on delete cascade,
  sessions              integer,
  users                 integer,
  engagement_rate       numeric(8,3),
  avg_engagement_time_sec integer,
  actions               integer,
  form_submissions      integer
);

create table public.web_channels (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.web_reports(id) on delete cascade,
  sort_order      integer not null default 0,
  name            text not null,
  sessions        integer,
  share_of_traffic numeric(8,3),
  engagement_rate  numeric(8,3)
);

create table public.web_pages (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.web_reports(id) on delete cascade,
  sort_order          integer not null default 0,
  key                 text not null,
  page_views          integer,
  bounce_rate         numeric(8,3),
  avg_time_on_page_sec integer
);

create table public.web_insights (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.web_reports(id) on delete cascade,
  working      text not null default '',
  not_working  text not null default '',
  actions      text not null default '',
  next_quarter text not null default ''
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger social_reports_updated_at
  before update on public.social_reports
  for each row execute function public.set_updated_at();

create trigger web_reports_updated_at
  before update on public.web_reports
  for each row execute function public.set_updated_at();

-- RLS
alter table public.social_reports   enable row level security;
alter table public.social_kpis      enable row level security;
alter table public.social_platforms enable row level security;
alter table public.social_top_posts enable row level security;
alter table public.social_posts     enable row level security;
alter table public.social_insights  enable row level security;
alter table public.web_reports      enable row level security;
alter table public.web_kpis         enable row level security;
alter table public.web_channels     enable row level security;
alter table public.web_pages        enable row level security;
alter table public.web_insights     enable row level security;

-- Public read (anon key, no login needed for the report viewer)
create policy "public read" on public.social_reports   for select using (true);
create policy "public read" on public.social_kpis      for select using (true);
create policy "public read" on public.social_platforms for select using (true);
create policy "public read" on public.social_top_posts for select using (true);
create policy "public read" on public.social_posts     for select using (true);
create policy "public read" on public.social_insights  for select using (true);
create policy "public read" on public.web_reports      for select using (true);
create policy "public read" on public.web_kpis         for select using (true);
create policy "public read" on public.web_channels     for select using (true);
create policy "public read" on public.web_pages        for select using (true);
create policy "public read" on public.web_insights     for select using (true);

-- Authenticated write (admin only)
create policy "auth write" on public.social_reports   for all using (auth.role() = 'authenticated');
create policy "auth write" on public.social_kpis      for all using (auth.role() = 'authenticated');
create policy "auth write" on public.social_platforms for all using (auth.role() = 'authenticated');
create policy "auth write" on public.social_top_posts for all using (auth.role() = 'authenticated');
create policy "auth write" on public.social_posts     for all using (auth.role() = 'authenticated');
create policy "auth write" on public.social_insights  for all using (auth.role() = 'authenticated');
create policy "auth write" on public.web_reports      for all using (auth.role() = 'authenticated');
create policy "auth write" on public.web_kpis         for all using (auth.role() = 'authenticated');
create policy "auth write" on public.web_channels     for all using (auth.role() = 'authenticated');
create policy "auth write" on public.web_pages        for all using (auth.role() = 'authenticated');
create policy "auth write" on public.web_insights     for all using (auth.role() = 'authenticated');
