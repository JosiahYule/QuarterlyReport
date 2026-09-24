-- Whether the actual final landed inside the "likely range" band that was
-- being shown during the quarter, and how wide that band was (as a fraction
-- of the projection) — lets the Trends page report a real coverage rate for
-- the confidence band, not just point-estimate accuracy.
alter table public.projection_audits
  add column if not exists band_covered boolean,
  add column if not exists band_rel_half numeric;
