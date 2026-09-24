-- Give web_reports a fiscal year, the way social_reports got one in
-- 20260821000000_add_year_to_reports_and_snapshots.sql.
--
-- That migration fixed social_reports and projection_snapshots and left
-- web_reports behind. web_reports is still UNIQUE (agency, quarter), so a
-- quarter suffix on its own identifies a row -- and a suffix repeats every
-- fiscal year. WebForm upserts on (agency, quarter), and the four child
-- tables hang off web_reports.id, so the first Q1 save of a new fiscal year
-- lands on *last* year's Q1 row: the upsert rewrites its summary and the
-- delete-then-insert on web_kpis / web_channels / web_pages / web_insights
-- replaces last year's numbers with this year's. The year is gone, and so is
-- the quarter it overwrote.
--
-- This is live, not hypothetical. The fiscal year turned over on 1 September
-- 2026, the current quarter is Q1 again, and no Q1 web row exists yet -- so
-- the next Q1 save, by hand or by the scheduled GA4 job, is the one that does
-- the damage. It is the prerequisite for automating those writes: an
-- unkeyed table plus a weekly job is a weekly chance to lose a year.
--
-- Year convention matches src/config.js buildQuarter() and the social
-- migration: the calendar year of the quarter's last day. The fiscal year
-- starts in September, so q2 (Dec-Feb) is the only quarter whose label
-- differs from the calendar year of its own first month.

alter table public.web_reports
  add column if not exists year text;

-- The existing rows (isl q2, q3, q4) are all the Sep 2025 - Aug 2026 fiscal
-- year. Expression matches the social backfill, so a q1 row created between
-- that migration and this one would still land on the right year.
update public.web_reports
   set year = case when quarter = 'q1' then '2025' else '2026' end
 where year is null;

alter table public.web_reports
  alter column year set not null;

alter table public.web_reports
  drop constraint if exists web_reports_agency_quarter_key;

alter table public.web_reports
  add constraint web_reports_agency_quarter_year_key
  unique (agency, quarter, year);

-- social_reports has constrained agency to the three brands since it was
-- created; web_reports never did, because it only ever held the 'isl' default.
-- Automated ingestion is about to write 'as' and 'ads' for the first time, and
-- a typo in a job's brand config would otherwise open a silent fourth brand
-- that no page reads and nobody notices.
alter table public.web_reports
  drop constraint if exists web_reports_agency_check;

alter table public.web_reports
  add constraint web_reports_agency_check
  check (agency = any (array['isl'::text, 'as'::text, 'ads'::text]));
