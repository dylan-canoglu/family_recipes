-- One-time data fix: the 203 seeded legacy recipes were inserted with
-- visibility = 'personal' and owner_id = null, instead of visibility =
-- 'global'. Nobody could ever actually see them (no owner_id matches
-- null, and they aren't 'global'), which is why /recipes only shows the
-- test row you added yourself. This backfills every ownerless recipe to
-- 'global', which is what the app's data model intends for shared
-- family recipes with no personal owner.
--
-- Safe to run once; re-running is a no-op for rows already 'global'.
update public.recipes
set visibility = 'global'
where owner_id is null
  and visibility <> 'global';
