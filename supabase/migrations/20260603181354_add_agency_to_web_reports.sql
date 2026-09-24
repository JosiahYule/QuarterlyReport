-- Recovered from the live database's migration history; applied on 3 June
-- 2026 but never committed. Verbatim.

-- Add agency column to web_reports
ALTER TABLE web_reports ADD COLUMN IF NOT EXISTS agency text NOT NULL DEFAULT 'isl';

-- Drop old unique constraint on quarter alone and replace with (agency, quarter)
ALTER TABLE web_reports DROP CONSTRAINT IF EXISTS web_reports_quarter_key;
ALTER TABLE web_reports ADD CONSTRAINT web_reports_agency_quarter_key UNIQUE (agency, quarter);
