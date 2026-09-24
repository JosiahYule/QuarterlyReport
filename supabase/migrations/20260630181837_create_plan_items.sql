-- Interactive planner / idea board for the admin Plan tab.
-- Private to signed-in managers (authenticated-only RLS), unlike the report
-- tables which are public-read. Scoped per agency + quarter.
create table if not exists public.plan_items (
  id           uuid primary key default gen_random_uuid(),
  agency       text not null,
  quarter      text not null,
  idea         text not null default '',
  content_type text,
  planned_date date,
  status       text not null default 'idea' check (status in ('idea','planned','posted')),
  notes        text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.plan_items enable row level security;

create policy "auth all" on public.plan_items
  for all to public
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create index if not exists plan_items_agency_quarter_idx
  on public.plan_items (agency, quarter, sort_order);
