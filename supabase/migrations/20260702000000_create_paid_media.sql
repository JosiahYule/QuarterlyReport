-- Paid media campaigns + ads for the Social report's "Paid Media" section.
-- Public-read / authenticated-write, matching the other social_* report tables.
create table if not exists public.paid_media_campaigns (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.social_reports(id) on delete cascade,
  sort_order integer not null default 0,
  name       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paid_media_ads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.paid_media_campaigns(id) on delete cascade,
  sort_order      integer not null default 0,
  name            text not null default '',
  impressions     integer,
  clicks          integer,
  cpc             numeric,
  engagement_rate numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.paid_media_campaigns enable row level security;
alter table public.paid_media_ads enable row level security;

create policy "public read" on public.paid_media_campaigns
  for select to public using (true);
create policy "auth write" on public.paid_media_campaigns
  for all to public using (auth.role() = 'authenticated');

create policy "public read" on public.paid_media_ads
  for select to public using (true);
create policy "auth write" on public.paid_media_ads
  for all to public using (auth.role() = 'authenticated');

create index if not exists paid_media_campaigns_report_idx
  on public.paid_media_campaigns (report_id, sort_order);
create index if not exists paid_media_ads_campaign_idx
  on public.paid_media_ads (campaign_id, sort_order);
