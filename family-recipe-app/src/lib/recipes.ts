import { db, type Recipe } from './db';

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
