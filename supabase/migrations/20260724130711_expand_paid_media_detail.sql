-- Richer Paid Media data, for the standalone Paid Media report page.
--
-- Campaign metadata: what the campaign was for (objective), where it ran
-- (platform), what it was budgeted at, and its flight window. Budget lets the
-- report show pacing (spend vs. budget); platform powers the "By Platform"
-- rollup.
alter table public.paid_media_campaigns
  add column if not exists objective  text not null default '',
  add column if not exists platform   text not null default '',
  add column if not exists budget     numeric,
  add column if not exists start_date date,
  add column if not exists end_date   date;

-- Deeper per-ad metrics. Reach (unique people) and conversions are stored;
-- frequency (impressions ÷ reach), conversion rate (conversions ÷ clicks),
-- CPM (spend ÷ impressions × 1000) and cost-per-conversion / CPA
-- (spend ÷ conversions) are all derived from these plus the existing columns.
alter table public.paid_media_ads
  add column if not exists reach       integer,
  add column if not exists conversions integer;
