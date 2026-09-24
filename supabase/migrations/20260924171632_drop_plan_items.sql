-- Retire the admin Plan tab and its table.
--
-- The planner (idea board, weekly calendar and posting suggestions) was not
-- in use, and its code has been removed. plan_items held four July 2026 rows.
-- It was also the one report-adjacent table still keyed by quarter suffix
-- alone, so from June 2027 last year's items would have resurfaced on the new
-- Q4's board. Nothing references it, so no CASCADE: a drop that would take
-- something else with it should fail loudly instead.
drop table if exists public.plan_items;
