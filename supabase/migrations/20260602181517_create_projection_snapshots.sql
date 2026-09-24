-- projection_snapshots was created by hand in the dashboard, so no migration
-- ever described it. This reconstructs it from the live catalog in the shape
-- it had before 20260824123700 added the year, so the migrations that follow
-- replay onto it cleanly.
--
-- Guarded, so it is a no-op wherever the table already exists. The anon write
-- policies match what the browser needed at the time; 20260824123747 drops
-- them once the cron job takes over the writes.
do $$
begin
  if to_regclass('public.projection_snapshots') is not null then
    return;
  end if;

  create table public.projection_snapshots (
    id            bigint generated always as identity primary key,
    agency        text not null,
    quarter       text not null,
    snapshot_date date not null default current_date,
    captured_at   timestamptz not null default now(),
    vals          jsonb not null,
    constraint projection_snapshots_agency_quarter_snapshot_date_key
      unique (agency, quarter, snapshot_date)
  );

  alter table public.projection_snapshots enable row level security;

  create policy "anon select" on public.projection_snapshots
    for select to anon, authenticated using (true);
  create policy "anon insert" on public.projection_snapshots
    for insert to anon, authenticated with check (true);
  create policy "anon update" on public.projection_snapshots
    for update to anon, authenticated using (true) with check (true);
end;
$$;
