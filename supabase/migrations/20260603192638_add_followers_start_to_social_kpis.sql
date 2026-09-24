-- Recovered from the live database's migration history; applied on 3 June
-- 2026 but never committed. Verbatim.
ALTER TABLE social_kpis ADD COLUMN IF NOT EXISTS followers_start integer;
