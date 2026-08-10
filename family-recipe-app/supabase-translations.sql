-- Adds storage for English translations of legacy (mostly French/Turkish)
-- recipe content, so the UI can default to English and let the user
-- toggle back to the original language.
--
-- ingredients_en mirrors the shape of `ingredients` (an array), but each
-- entry is just the translated display line -- it doesn't need the full
-- structured object (raw/item/unit/quantity/...) that the original import
-- produced, since it exists purely for display.
--
-- Safe to re-run.
alter table public.recipes
  add column if not exists instructions_en text,
  add column if not exists ingredients_en jsonb;
