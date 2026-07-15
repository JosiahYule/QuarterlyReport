-- Contact form submissions, imported from the website form's CSV export.
-- Unlike the report tables these rows carry PII (names, emails, phones,
-- resume links, free-text comments), so reads require auth. The public
-- Website tab gets only non-PII aggregates through the
-- form_submission_stats() security-definer function below.
create table if not exists public.form_submissions (
  id                uuid primary key default gen_random_uuid(),
  agency            text not null default 'isl',
  -- Wall-clock time in the agencies' home timezone (America/Halifax),
  -- exactly as the form exports it — no zone math on import or in stats.
  submitted_at      timestamp not null,
  name              text not null default '',
  email             text not null default '',
  phone             text not null default '',
  location          text not null default '',
  intent            text not null default 'unknown', -- work | staff | unknown
  source            text not null default '',        -- "How did you hear about us?"
  source_detail     text not null default '',        -- "Please describe" (source = Other)
  comments          text not null default '',
  document_url      text not null default '',
  accepts_marketing boolean not null default false,
  created_at        timestamptz not null default now()
);

-- Exports overlap (each one is a full dump), so re-imports must be safe:
-- one row per submission, keyed by when it arrived and who sent it.
create unique index if not exists form_submissions_dedupe_idx
  on public.form_submissions (agency, submitted_at, email);

alter table public.form_submissions enable row level security;

create policy "auth read" on public.form_submissions
  for select to public using (auth.role() = 'authenticated');
create policy "auth write" on public.form_submissions
  for all to public using (auth.role() = 'authenticated');

-- Non-PII aggregates for the public report page. p_end is exclusive.
create or replace function public.form_submission_stats(
  p_agency text,
  p_start  date,
  p_end    date
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with rows as (
  select * from form_submissions
  where agency = p_agency
    and submitted_at >= p_start
    and submitted_at < p_end
),
-- "How did you hear about us?" was added to the form later; blanks from
-- before the first answer mean "question didn't exist", not non-response.
source_era as (
  select min(submitted_at) as since
  from form_submissions
  where agency = p_agency and source <> ''
)
select jsonb_build_object(
  'totals', (select jsonb_build_object(
      'total',        count(*),
      'work',         count(*) filter (where intent = 'work'),
      'staff',        count(*) filter (where intent = 'staff'),
      'optIn',        count(*) filter (where accepts_marketing),
      'withDocument', count(*) filter (where document_url <> '')
    ) from rows),
  'weekly', (select coalesce(jsonb_agg(to_jsonb(w) order by w.week), '[]'::jsonb) from (
      select date_trunc('week', submitted_at)::date as week,
             count(*)                                    as total,
             count(*) filter (where intent = 'work')     as work,
             count(*) filter (where intent = 'staff')    as staff,
             count(*) filter (where accepts_marketing)   as "optIn"
      from rows group by 1
    ) w),
  'locations', (select coalesce(jsonb_agg(to_jsonb(l) order by l.total desc), '[]'::jsonb) from (
      select trim(split_part(location, ',', 1))          as location,
             count(*)                                    as total,
             count(*) filter (where intent = 'work')     as work,
             count(*) filter (where intent = 'staff')    as staff
      from rows where location <> '' group by 1
    ) l),
  'sources', (select coalesce(jsonb_agg(to_jsonb(s) order by s.count desc), '[]'::jsonb) from (
      select source, count(*) as count
      from rows where source <> '' group by 1
    ) s),
  'sourceSince', (select to_char(since, 'YYYY-MM-DD') from source_era),
  'sourceEligible', (select count(*) from rows, source_era
      where since is not null and submitted_at >= since),
  'heatmap', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from (
      select extract(isodow from submitted_at)::int as dow,
             extract(hour from submitted_at)::int   as hour,
             count(*)                                as count
      from rows group by 1, 2
    ) h)
);
$$;

revoke all on function public.form_submission_stats(text, date, date) from public;
grant execute on function public.form_submission_stats(text, date, date) to anon, authenticated;
