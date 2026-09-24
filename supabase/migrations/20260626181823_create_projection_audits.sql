-- Recovered from the live database's migration history; applied on 26 June
-- 2026 but never committed. Verbatim. The anon write policies it creates are
-- replaced by 20260924120000_restrict_writes_to_admins.
create table if not exists projection_audits (
  id bigint generated always as identity primary key,
  agency text not null,
  quarter text not null,
  year text not null,
  metric_id text not null,
  actual numeric not null,
  avg_projected numeric not null,
  percent_error numeric,
  accuracy_ratio numeric not null,
  calibration_confidence numeric not null,
  calibration_factor numeric not null,
  sample_count int not null,
  first_day int,
  last_day int,
  computed_at timestamptz not null default now(),
  unique (agency, quarter, year, metric_id)
);

alter table projection_audits enable row level security;

create policy "anon select" on projection_audits
  for select to anon, authenticated using (true);

create policy "anon insert" on projection_audits
  for insert to anon, authenticated with check (true);

create policy "anon update" on projection_audits
  for update to anon, authenticated using (true) with check (true);
