-- Family Recipe Vault — Row Level Security policies
-- Run this in the Supabase SQL Editor (Database > SQL Editor > New query).
-- Safe to re-run: every policy is dropped before being recreated.

-- ---------------------------------------------------------------------
-- Admin helper — keep this list in sync with ADMIN_EMAILS in
-- src/pages/Admin.tsx. This is the server-side source of truth;
-- the client-side list is just a UI convenience gate.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select (auth.jwt() ->> 'email') in ('dylan.canoglu@gmail.com');
$$;

-- ---------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------
alter table public.recipes enable row level security;

drop policy if exists recipes_select on public.recipes;
create policy recipes_select on public.recipes
  for select to authenticated
  using (visibility = 'global' or owner_id = auth.uid() or is_admin());

drop policy if exists recipes_insert on public.recipes;
create policy recipes_insert on public.recipes
  for insert to authenticated
  with check (owner_id = auth.uid() and visibility = 'personal');

-- Owners can edit their own non-global recipes (drafts, trash/restore).
-- Once a recipe is 'global', only the admin can touch it — edits and
-- deletes must go through the approval_requests pipeline instead.
drop policy if exists recipes_update on public.recipes;
create policy recipes_update on public.recipes
  for update to authenticated
  using ((owner_id = auth.uid() and visibility <> 'global') or is_admin())
  with check ((owner_id = auth.uid() and visibility <> 'global') or is_admin());

drop policy if exists recipes_delete on public.recipes;
create policy recipes_delete on public.recipes
  for delete to authenticated
  using ((owner_id = auth.uid() and visibility <> 'global') or is_admin());

-- ---------------------------------------------------------------------
-- approval_requests
-- ---------------------------------------------------------------------
alter table public.approval_requests enable row level security;

drop policy if exists approval_requests_select on public.approval_requests;
create policy approval_requests_select on public.approval_requests
  for select to authenticated
  using (requested_by = auth.uid() or is_admin());

drop policy if exists approval_requests_insert on public.approval_requests;
create policy approval_requests_insert on public.approval_requests
  for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending');

-- Only the admin can resolve (approve/reject) a request.
drop policy if exists approval_requests_update on public.approval_requests;
create policy approval_requests_update on public.approval_requests
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------
-- user_hidden_recipes — always private to the user who hid the recipe
-- ---------------------------------------------------------------------
alter table public.user_hidden_recipes enable row level security;

drop policy if exists user_hidden_recipes_select on public.user_hidden_recipes;
create policy user_hidden_recipes_select on public.user_hidden_recipes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_hidden_recipes_insert on public.user_hidden_recipes;
create policy user_hidden_recipes_insert on public.user_hidden_recipes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_hidden_recipes_delete on public.user_hidden_recipes;
create policy user_hidden_recipes_delete on public.user_hidden_recipes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- favorites — always private to the user
-- ---------------------------------------------------------------------
alter table public.favorites enable row level security;

drop policy if exists favorites_select on public.favorites;
create policy favorites_select on public.favorites
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists favorites_insert on public.favorites;
create policy favorites_insert on public.favorites
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists favorites_delete on public.favorites;
create policy favorites_delete on public.favorites
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- user_recipe_notes — always private to the user
-- ---------------------------------------------------------------------
alter table public.user_recipe_notes enable row level security;

drop policy if exists user_recipe_notes_select on public.user_recipe_notes;
create policy user_recipe_notes_select on public.user_recipe_notes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_recipe_notes_insert on public.user_recipe_notes;
create policy user_recipe_notes_insert on public.user_recipe_notes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_recipe_notes_update on public.user_recipe_notes;
create policy user_recipe_notes_update on public.user_recipe_notes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_recipe_notes_delete on public.user_recipe_notes;
create policy user_recipe_notes_delete on public.user_recipe_notes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- cooking_logs — private to the user for now. If the future Discovery
-- tab needs family-wide "most cooked" stats, widen the select policy
-- (e.g. `using (true)`) or expose an aggregate via a security-definer
-- view/RPC instead of opening up raw rows.
-- ---------------------------------------------------------------------
alter table public.cooking_logs enable row level security;

drop policy if exists cooking_logs_select on public.cooking_logs;
create policy cooking_logs_select on public.cooking_logs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists cooking_logs_insert on public.cooking_logs;
create policy cooking_logs_insert on public.cooking_logs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists cooking_logs_update on public.cooking_logs;
create policy cooking_logs_update on public.cooking_logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists cooking_logs_delete on public.cooking_logs;
create policy cooking_logs_delete on public.cooking_logs
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- meal_plan — shared household data, no per-row owner column today.
-- Any signed-in family member can read/write it. If multi-household
-- support is ever added, scope these to household_id instead.
-- ---------------------------------------------------------------------
alter table public.meal_plan enable row level security;

drop policy if exists meal_plan_all on public.meal_plan;
create policy meal_plan_all on public.meal_plan
  for all to authenticated
  using (true)
  with check (true);
