-- College/meal-prep metadata for recipes (mirrors Dexie schema v6 in src/lib/db.ts).
--
-- Run this in the Supabase SQL editor BEFORE deploying a build that writes
-- these fields; inserts that include unknown columns fail wholesale.
--
-- All columns are nullable on purpose: the ~200 imported recipes predate this
-- classification, and NULL means "not yet reviewed" -- distinct from FALSE.
-- Prep/cook times intentionally stay on the existing prep_time_min /
-- cook_time_min columns; do not add parallel *_minutes columns.

alter table public.recipes
  add column if not exists is_main_dish boolean,
  add column if not exists college_staple boolean,
  add column if not exists meal_prep_friendly boolean,
  add column if not exists tags text[];

-- The filter bar reads these on every catalog load once synced locally, but
-- server-side filtered queries (e.g. future paginated fetches) benefit too.
create index if not exists recipes_college_staple_idx on public.recipes (college_staple) where college_staple = true;
create index if not exists recipes_is_main_dish_idx on public.recipes (is_main_dish) where is_main_dish = true;
create index if not exists recipes_tags_idx on public.recipes using gin (tags);
