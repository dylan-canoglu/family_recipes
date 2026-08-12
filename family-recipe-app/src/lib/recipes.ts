import { db, type Recipe } from './db';
import { supabase } from './supabase';

// The v6 metadata columns (see supabase-college-metadata.sql). If that
// migration hasn't been run yet, cloud writes that include these fields fail
// wholesale -- so writers retry without them rather than losing the recipe.
const COLLEGE_METADATA_FIELDS = ['is_main_dish', 'college_staple', 'meal_prep_friendly', 'tags'] as const;

const isMissingColumnError = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703' ||
    /column .* does not exist|Could not find the .* column/i.test(error.message ?? ''));

// Insert a recipe in Supabase, degrading gracefully when the metadata
// migration is missing. Returns `strippedMetadata: true` when the recipe was
// saved but its college metadata only lives locally until the SQL is applied.
export async function pushRecipeToCloud(recipe: Record<string, unknown>) {
  const { error } = await supabase.from('recipes').insert([recipe]);
  if (!error || !isMissingColumnError(error)) return { error, strippedMetadata: false };

  const slim = { ...recipe };
  for (const field of COLLEGE_METADATA_FIELDS) delete slim[field];
  const retry = await supabase.from('recipes').insert([slim]);
  return { error: retry.error, strippedMetadata: !retry.error };
}

// Same degradation for updates (used by the admin review sweep).
export async function updateRecipeInCloud(id: string, changes: Record<string, unknown>) {
  const { error } = await supabase.from('recipes').update(changes).eq('id', id);
  if (!error || !isMissingColumnError(error)) return { error, strippedMetadata: false };

  const slim = { ...changes };
  for (const field of COLLEGE_METADATA_FIELDS) delete slim[field];
  if (Object.keys(slim).length === 0) return { error: null, strippedMetadata: true };
  const retry = await supabase.from('recipes').update(slim).eq('id', id);
  return { error: retry.error, strippedMetadata: !retry.error };
}

// The vault-wide rules for what a given user is allowed to see: nothing in the
// trash, nothing they've personally hidden, and personal drafts only if they
// own them. Shared so the catalog, Discovery, and the meal planner's recipe
// picker can't drift apart on what counts as visible.
export async function getVisibleRecipes(userId?: string | null): Promise<Recipe[]> {
  const allRecipes = await db.recipes.toArray();

  const hiddenRecords = userId
    ? await db.user_hidden_recipes.where({ user_id: userId }).toArray()
    : [];
  const hiddenIds = new Set(hiddenRecords.map((h) => h.recipe_id));

  return allRecipes.filter((recipe) => {
    // Skip records too broken to render.
    if (!recipe || !recipe.id) return false;
    if (recipe.deleted_at) return false;
    if (hiddenIds.has(recipe.id)) return false;

    // Legacy rows predate the visibility column; treat those as global.
    const isGlobal = recipe.visibility === 'global' || !recipe.visibility;
    if (!isGlobal && recipe.owner_id !== userId) return false;

    return true;
  });
}
