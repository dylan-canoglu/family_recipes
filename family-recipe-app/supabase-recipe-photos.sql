-- User-uploaded "food photos" -- pictures of the finished dish, separate
-- from the legacy scanned-recipe-card images already stored in
-- recipes.image_path (which is now only used for the "verify against
-- original" flip, not for display). Multiple photos per recipe.
--
-- Safe to re-run.

create table if not exists public.recipe_photos (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_photos enable row level security;

drop policy if exists recipe_photos_select on public.recipe_photos;
create policy recipe_photos_select on public.recipe_photos
  for select to authenticated
  using (true);

drop policy if exists recipe_photos_insert on public.recipe_photos;
create policy recipe_photos_insert on public.recipe_photos
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists recipe_photos_delete on public.recipe_photos;
create policy recipe_photos_delete on public.recipe_photos
  for delete to authenticated
  using (user_id = auth.uid() or is_admin());
