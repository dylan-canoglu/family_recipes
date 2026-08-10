-- Sets up image storage for recipes: a bucket plus RLS-style storage
-- policies. The bucket is public so <img> tags can use plain permanent
-- URLs (no signed-URL rotation to manage) -- these are just recipe
-- photos, not sensitive data. Only write access is gated: an
-- authenticated user can upload, and only the uploader (storage.objects
-- .owner is set automatically by Supabase) or an admin can modify/delete.
--
-- Safe to re-run.

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do update set public = true;

drop policy if exists recipe_images_select on storage.objects;
create policy recipe_images_select on storage.objects
  for select to public
  using (bucket_id = 'recipe-images');

drop policy if exists recipe_images_insert on storage.objects;
create policy recipe_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-images');

drop policy if exists recipe_images_update on storage.objects;
create policy recipe_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-images' and (owner = auth.uid() or is_admin()));

drop policy if exists recipe_images_delete on storage.objects;
create policy recipe_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images' and (owner = auth.uid() or is_admin()));
