-- Translated recipe CONTENT -- titles, ingredients, instructions, notes.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- WHY A TABLE AND NOT AN API CALL AT RENDER TIME
-- ----------------------------------------------
-- Translating on demand would mean an API key in the browser, and a browser
-- key is public: it ships inside the JavaScript bundle for anyone to read and
-- spend. It would also break the thing this app is built around -- the vault
-- works with no signal, and a kitchen is exactly where the signal goes. So
-- translations are generated once by scripts/translate-recipes.mjs (run from
-- a laptop, where the key stays), written here, and synced into Dexie like
-- every other recipe field. Reading a translated recipe then costs nothing
-- and works offline.
--
-- One row per (recipe, language). A table rather than title_fr/title_tr/...
-- columns, so adding a fourth language is data rather than a migration.

create table if not exists public.recipe_translations (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  lang text not null check (lang in ('en', 'fr', 'tr')),
  title text,
  -- Mirrors ingredients_en: display lines, not the structured objects the
  -- legacy import produced. formatIngredientList handles both shapes.
  ingredients jsonb,
  instructions text,
  notes text,
  -- Lets a re-run of the script skip work that is already done, and lets a
  -- human correction be told apart from a machine one.
  source text not null default 'machine' check (source in ('machine', 'human')),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, lang)
);

create index if not exists recipe_translations_lang_idx
  on public.recipe_translations (lang);

-- ---------------------------------------------------------------------
-- RLS: readable by exactly whoever can read the recipe itself.
-- Writes are left to the service role (the batch script), so nothing in
-- the browser can rewrite a family recipe's text.
-- ---------------------------------------------------------------------
alter table public.recipe_translations enable row level security;

drop policy if exists recipe_translations_select on public.recipe_translations;
create policy recipe_translations_select on public.recipe_translations
  for select to authenticated
  using (true);

-- Guests read the shared collection, so they read its translations too.
-- Scoped through the parent recipe's visibility rather than granted flatly,
-- so a future personal draft's translation is not exposed either.
drop policy if exists recipe_translations_select_guest on public.recipe_translations;
create policy recipe_translations_select_guest on public.recipe_translations
  for select to anon
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.visibility = 'global'
    )
  );

-- ---------------------------------------------------------------------
-- Backfill from the existing English columns.
--
-- 52 recipes already carry instructions_en / ingredients_en from an earlier
-- pass. Copying them in means the new path has data the moment it ships,
-- and the translation script has 52 fewer recipes to pay for.
-- ---------------------------------------------------------------------
insert into public.recipe_translations (recipe_id, lang, ingredients, instructions, source)
select
  id,
  'en',
  ingredients_en,
  instructions_en,
  'machine'
from public.recipes
where instructions_en is not null
   or (ingredients_en is not null and jsonb_array_length(ingredients_en) > 0)
on conflict (recipe_id, lang) do nothing;

select lang, count(*) as translated_recipes
from public.recipe_translations
group by lang
order by lang;
