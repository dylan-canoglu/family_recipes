-- Guest (read-only) access to the family vault.
--
-- Run this in the Supabase SQL Editor (Database > SQL Editor > New query).
-- Safe to re-run: every policy is dropped before being recreated.
--
-- WHAT THIS OPENS UP
-- ------------------
-- These policies grant the `anon` Postgres role -- the role every request
-- carries when there is no signed-in user -- SELECT on the shared recipes
-- and their photos. The anon API key is public by design: it ships inside
-- the JavaScript bundle, so anyone who opens devtools can read it. Granting
-- anon SELECT therefore makes the global recipes readable by anyone on the
-- internet, not only by people who tap "Explore as guest" in the UI. That
-- is the intended trade for having a public demo.
--
-- WHY READ-ONLY IS STRUCTURAL, NOT A UI CONVENTION
-- ------------------------------------------------
-- Postgres RLS denies by default. Only SELECT policies are created below,
-- so there is no path by which the anon role can insert, update or delete
-- anything -- the database refuses the write regardless of what the client
-- asks for. Read-only does not depend on the app remembering to hide a
-- button.
--
-- This is also why guests are NOT signed in anonymously via Supabase Auth.
-- An anonymous sign-in would carry the `authenticated` role, which inherits
-- every existing write policy -- including meal_plan's
-- `for all to authenticated using (true)`. A guest could then edit or wipe
-- the household's meal plan. Staying on the anon role avoids that entirely.

-- ---------------------------------------------------------------------
-- FIRST, READ THIS -- the vault was already publicly readable.
--
-- Probing the live database with the anon key (no session) returned real
-- recipe rows, which the policies in supabase-rls.sql cannot explain: the
-- only SELECT policy there is `to authenticated`. So a second, more
-- permissive SELECT policy exists on public.recipes that this repo never
-- wrote down -- almost certainly Supabase's default "Enable read access
-- for all users" (`for select using (true)`, which applies to `public`
-- and therefore to anon). supabase-rls.sql would not have removed it,
-- because it only drops the specific name `recipes_select`.
--
-- Why that matters: RLS policies are OR'd. A permissive `using (true)`
-- policy means every recipe is exposed regardless of visibility, so a
-- future personal draft would be public the moment it is written. Adding
-- a narrower policy alongside it would change nothing at all.
--
-- So this block replaces every SELECT policy on recipes with exactly the
-- two intended ones. Writes are untouched -- the probe confirmed inserts
-- are already correctly refused with 42501.
--
-- To see what is there before changing anything, run:
--   select policyname, cmd, roles, qual from pg_policies
--   where schemaname = 'public' and tablename = 'recipes';
-- ---------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'recipes' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.recipes', pol.policyname);
  end loop;
end $$;

-- Family members: unchanged from supabase-rls.sql, recreated here because
-- the sweep above necessarily dropped it too.
create policy recipes_select on public.recipes
  for select to authenticated
  using (visibility = 'global' or owner_id = auth.uid() or is_admin());

-- Guests: the shared collection only.
--
-- `visibility = 'global'` is load-bearing -- it is what keeps personal
-- drafts and anything soft-deleted out of public view, which the policy
-- being replaced above did not do.
create policy recipes_select_guest on public.recipes
  for select to anon
  using (visibility = 'global');

-- ---------------------------------------------------------------------
-- recipe_photos -- the display images.
--
-- image_path (the archival notebook scan) lives on the recipes row and is
-- reachable via the recipes policy above. These are the gallery photos,
-- and the storage bucket that actually serves the bytes is already public
-- (see supabase-storage.sql), so this row-level grant is what makes the
-- thumbnails resolve rather than a new exposure of the files themselves.
-- ---------------------------------------------------------------------
drop policy if exists recipe_photos_select_guest on public.recipe_photos;
create policy recipe_photos_select_guest on public.recipe_photos
  for select to anon
  using (true);

-- ---------------------------------------------------------------------
-- Deliberately NOT granted to anon:
--
--   favorites, user_recipe_notes, user_hidden_recipes, cooking_logs,
--   approval_requests  -- personal to a family member.
--   meal_plan          -- the household's actual week. A guest is here to
--                         see what the planner does, not what the family
--                         is eating on Thursday.
--   admins             -- the admin roster.
--   recipe_cook_stats()-- already `revoke ... from public, anon` in
--                         supabase-cook-stats.sql, and it computes
--                         cook_count_mine from auth.uid(). Discovery is
--                         sign-in gated, so guests never call it.
--
-- Leave these alone. Each one is either personal data or a write surface.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Verify. After running the above, this should list exactly two SELECT
-- policies on recipes -- recipes_select {authenticated} and
-- recipes_select_guest {anon} -- and nothing addressed to {public}.
-- A row with roles = {public} is the permissive leftover; if one is still
-- here, the sweep did not catch it and guests can read more than the
-- shared collection.
-- ---------------------------------------------------------------------
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('recipes', 'recipe_photos')
order by tablename, cmd, policyname;
