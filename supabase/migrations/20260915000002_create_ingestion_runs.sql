-- A log of every automated ingestion attempt.
--
-- The failure mode this exists for: a scheduled job that quietly stops working
-- is not noticed at the time, it is noticed at reporting time, as a quarter of
-- missing data. web_reports.updated_at cannot tell you -- it moves when the
-- admin form saves too, it does not move when only child tables change, and a
-- run that dies before writing leaves it untouched, which is exactly the case
-- that needs to be visible.
--
-- So the run records itself, not its output. A row appears whether the run
-- succeeded, failed, or decided there was nothing to write, and the admin
-- reads the most recent one. Silence in this table is itself the signal.
create table if not exists public.ingestion_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,                 -- 'ga4'
  agency       text,                          -- null on a run-level row
  quarter      text,
  year         text,
  status       text not null check (status in ('success', 'failed', 'skipped')),
  rows_written integer not null default 0,
  message      text not null default '',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- The admin's only query is "the latest run for this source and agency".
create index if not exists ingestion_runs_recent_idx
  on public.ingestion_runs (source, agency, started_at desc);

alter table public.ingestion_runs enable row level security;

-- Operational data, not report data: the public pages have no use for it, and
-- the message column can carry an API error verbatim. Readable by the signed-in
-- admin, written only by the job, which runs as service_role and bypasses RLS.
create policy "auth read" on public.ingestion_runs
  for select to public using (auth.role() = 'authenticated');

comment on table public.ingestion_runs is
  'One row per automated ingestion attempt. Surfaced in the admin so a job that stops working is noticed then, not at reporting time.';
