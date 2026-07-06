-- Per-ad lifecycle status, shown as a colored tag next to each ad in the
-- Paid Media section of the Social report.
alter table public.paid_media_ads
  add column status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'draft'));
