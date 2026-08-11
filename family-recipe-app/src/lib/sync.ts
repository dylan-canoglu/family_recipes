import { supabase } from './supabase';
import { db } from './db';

export async function syncRecipes() {
  try {
    console.log('Starting recipe sync from Supabase...');
    
    // 1. Fetch all recipes from Supabase
    // Note: If you have RLS enabled, ensure your policies allow read access!
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*');

    if (error) {
      console.error('Supabase fetch error:', error.message);
      throw error;
    }

    // 2. Upsert them into the local Dexie database
    if (recipes && recipes.length > 0) {
      // bulkPut will insert new records and update existing ones based on the 'id' primary key
      await db.recipes.bulkPut(recipes);
      console.log(`Successfully synced ${recipes.length} recipes to local offline vault.`);
    }
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

export async function syncUserData(userId: string) {
  try {
    console.log('Syncing user-specific data from Supabase...');
    
    // 1. Favorites
    const { data: favorites } = await supabase.from('favorites').select('*').eq('user_id', userId);
    if (favorites) await db.favorites.bulkPut(favorites);

    // 2. Personal Notes
    const { data: notes } = await supabase.from('user_recipe_notes').select('*').eq('user_id', userId);
    if (notes) await db.user_recipe_notes.bulkPut(notes);

    // 3. Hidden Recipes (NEW)
    const { data: hidden } = await supabase.from('user_hidden_recipes').select('*').eq('user_id', userId);
    if (hidden) await db.user_hidden_recipes.bulkPut(hidden);

    // 4. Approval Requests (NEW)
    const { data: approvals } = await supabase.from('approval_requests').select('*').eq('requested_by', userId);
    if (approvals) await db.approval_requests.bulkPut(approvals);

    // 5. Cooking Logs -- RLS keeps these private to the user, so this only
    // ever returns their own. Family-wide stats come from syncRecipeStats().
    const { data: logs } = await supabase.from('cooking_logs').select('*').eq('user_id', userId);
    if (logs) await db.cooking_logs.bulkPut(logs);

    console.log('Successfully synced all user data (Favorites, Notes, Hidden, Approvals, Cooking Logs).');
  } catch (err) {
    console.error('User data sync failed:', err);
  }
}

// Admin-only: pulls every approval request regardless of requester, so the
// review dashboard can see requests submitted by any family member.
export async function syncAllApprovalRequests() {
  try {
    const { data, error } = await supabase.from('approval_requests').select('*');
    if (error) throw error;
    if (data) await db.approval_requests.bulkPut(data);
  } catch (err) {
    console.error('Approval request sync failed:', err);
  }
}

// Food photos are visible to every family member, not just the uploader,
// so this pulls per-recipe on demand rather than syncing the whole table.
export async function syncRecipePhotos(recipeId: string) {
  try {
    const { data, error } = await supabase.from('recipe_photos').select('*').eq('recipe_id', recipeId);
    if (error) throw error;
    if (data) await db.recipe_photos.bulkPut(data);
  } catch (err) {
    console.error('Recipe photos sync failed:', err);
  }
}