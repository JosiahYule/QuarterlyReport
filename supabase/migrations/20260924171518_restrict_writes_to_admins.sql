-- Tie edit access to a named list of people, not to being signed in.
--
-- Until now every write policy, and the read policy on form_submissions, was
-- `auth.role() = 'authenticated'`: anyone holding a session. The only thing
-- standing between that and the public was the project's sign-up setting,
-- because a magic link creates an account for any address it is sent to. One
-- toggle flipped in the dashboard would have handed a stranger write access
-- to every report and read access to every contact-form submission (names,
-- emails, phone numbers, resume links).
--
-- After this, a session is necessary but not sufficient: the signed-in email
-- must also be in public.admins. Add someone with
--
--   insert into public.admins (email) values ('name@example.com');
--
-- in the SQL editor, then invite them from Authentication > Users.

-- ─── The allowlist ────────────────────────────────────────────────
create table public.admins (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- A signed-in user can see their own row and nothing else, which is all
-- is_admin() needs. There are no write policies: the list is managed from the
-- SQL editor, which runs as the table owner and is not subject to RLS.
create policy "self read" on public.admins
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- SECURITY INVOKER on purpose: it reads admins through the policy above, so it
-- needs no elevated rights. The email claim is set by Supabase Auth and can
-- only change through a confirmed email change.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ─── Report tables: public read, admin write ──────────────────────
-- One policy per write command rather than a single FOR ALL, which also
-- matched SELECT and duplicated the public read policy on every table.
-- `(select public.is_admin())` is evaluated once per statement, not per row.
do $$
declare
  t text;
begin
  foreach t in array array[
    'social_reports', 'social_kpis', 'social_platforms', 'social_top_posts',
    'social_posts', 'social_insights',
    'web_reports', 'web_kpis', 'web_channels', 'web_pages', 'web_insights',
    'paid_media_campaigns', 'paid_media_ads', 'paid_media_demographics',
    'paid_media_click_paths',
    'projection_audits'
  ] loop
    execute format('drop policy if exists "auth write" on public.%I', t);
    execute format(
      'create policy "admin insert" on public.%I for insert to authenticated
         with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin update" on public.%I for update to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin delete" on public.%I for delete to authenticated
         using ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- ─── projection_audits ────────────────────────────────────────────
-- Written by the Trends page in the browser. These let anyone holding the
-- public anon key insert or overwrite an audit, and the Trends projections
-- read their calibration factor from this table, so the public could skew
-- every projection by up to the clamp (x0.5 to x1.5). Writes now need an admin
-- session, which the Trends page has whenever the admin has signed in on the
-- same browser.
drop policy if exists "anon insert" on public.projection_audits;
drop policy if exists "anon update" on public.projection_audits;
alter policy "anon select" on public.projection_audits rename to "public read";
alter policy "anon select" on public.projection_snapshots rename to "public read";

-- ─── form_submissions: admin only, read included ──────────────────
drop policy if exists "auth read" on public.form_submissions;
drop policy if exists "auth write" on public.form_submissions;

create policy "admin read" on public.form_submissions
  for select to authenticated using ((select public.is_admin()));
create policy "admin insert" on public.form_submissions
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin update" on public.form_submissions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete" on public.form_submissions
  for delete to authenticated using ((select public.is_admin()));

-- ─── Advisor: pin search_path on the two functions that lacked it ─
-- Neither references an unqualified object outside pg_catalog, so an empty
-- search_path changes nothing except closing the door the linter flags.
alter function public.set_updated_at() set search_path = '';
alter function public.fiscal_quarter(date) set search_path = '';
