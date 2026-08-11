-- Family-wide cooking statistics for the Discovery tab.
--
-- cooking_logs is deliberately locked down to `user_id = auth.uid()` (see
-- supabase-rls.sql), because a log row carries a personal note and says who
-- cooked what. Discovery needs family-wide numbers -- "most cooked", "highly
-- rated but you haven't tried it" -- so rather than widening that policy and
-- exposing raw rows, this exposes ONLY aggregates: counts, an average rating,
-- and a last-cooked date. No notes, no user ids.
--
-- Safe to re-run.

create or replace function public.recipe_cook_stats()
returns table (
  recipe_id uuid,
  cook_count bigint,
  cook_count_mine bigint,
  avg_rating numeric,
  rating_count bigint,
  last_cooked_at text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.recipe_id,
    count(*) as cook_count,
    count(*) filter (where l.user_id = auth.uid()) as cook_count_mine,
    avg(l.rating) filter (where l.rating > 0) as avg_rating,
    count(*) filter (where l.rating > 0) as rating_count,
    -- Cast to text so this works whether cooked_at is date or timestamptz;
    -- the client stores it as a string either way.
    max(l.cooked_at)::text as last_cooked_at
  from public.cooking_logs l
  group by l.recipe_id;
$$;

-- security definer functions are executable by everyone by default; restrict
-- to signed-in family members.
revoke all on function public.recipe_cook_stats() from public, anon;
grant execute on function public.recipe_cook_stats() to authenticated;
