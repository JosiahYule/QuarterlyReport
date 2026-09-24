-- Optional time-of-day a post went out, alongside the existing post_date.
-- Lets the Plan tab suggest a best time to post, not just a best day.
-- Nullable/free-form "HH:MM" (24h) so older/back-filled rows without a
-- recorded time still work — they just don't factor into time-of-day stats.
alter table public.social_posts
  add column if not exists post_time text;
