import Dexie, { type Table } from 'dexie';

// --- UPDATED RECIPE INTERFACE ---
export interface Recipe {
  id: string; household_id: string; title: string; cuisine: string | null;
  dish_type: 'Main Dish' | 'Appetizer' | 'Dessert' | 'Pastry' | 'Soup' | 'Sauce' | 'Side' | 'Breakfast' | 'Drink';
  complexity: 'Easy' | 'Medium' | 'Hard'; prep_time_min: number; cook_time_min: number; total_time_min: number; 
  base_servings: number; ingredients: any; instructions: string; notes: string; image_path: string;
  source_type: 'family' | 'manual' | 'imported_url'; source_url: string; created_at: Date | string; updated_at: Date | string;
  // New Fields:
  owner_id?: string | null;
  visibility: 'personal' | 'pending_global' | 'global';
  deleted_at?: Date | string | null;
  // English translations for legacy (mostly French/Turkish) recipes.
  // Absent/null means there's nothing to translate -- the original is
  // already the display language.
  instructions_en?: string | null;
  ingredients_en?: string[] | null;
}

export interface CookingLog { id: string; recipe_id: string; user_id: string; cooked_at: Date | string; rating: number; notes: string; }
export interface Favorite { id: string; recipe_id: string; user_id: string; created_at: Date | string; }
export interface MealPlan { id: string; household_id: string; plan_date: Date | string; meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'; recipe_id: string; created_at: Date | string; }
export interface UserRecipeNote { id: string; user_id: string; recipe_id: string; note_text: string; created_at: Date | string; updated_at: Date | string; }

// --- NEW INTERFACES ---
export interface UserHiddenRecipe {
  id: string;
  user_id: string;
  recipe_id: string;
  created_at: Date | string;
}

export interface ApprovalRequest {
  id: string;
  recipe_id: string;
  requested_by: string;
  request_type: 'promote_to_global' | 'edit_global' | 'delete_global';
  proposed_changes?: any;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date | string;
  resolved_at?: Date | string | null;
}

// User-uploaded photos of the finished dish -- distinct from
// Recipe.image_path, which (for legacy recipes) is the scanned
// original recipe card, shown only via the "verify original" flip.
export interface RecipePhoto {
  id: string;
  recipe_id: string;
  user_id: string;
  image_path: string;
  created_at: Date | string;
}

// Family-wide cooking aggregates, pulled from the recipe_cook_stats() RPC.
// cooking_logs itself is private per-user under RLS, so these pre-aggregated
// counts are the only family-wide view of who has cooked what -- deliberately
// without notes or user ids. Cached locally so Discovery works offline.
export interface RecipeStat {
  recipe_id: string;
  cook_count: number;
  // How many of those cooks are the signed-in user's own.
  cook_count_mine: number;
  avg_rating: number | null;
  rating_count: number;
  last_cooked_at: string | null;
}

export class RecipeVaultDB extends Dexie {
  recipes!: Table<Recipe>;
  cooking_logs!: Table<CookingLog>;
  favorites!: Table<Favorite>;
  meal_plan!: Table<MealPlan>;
  user_recipe_notes!: Table<UserRecipeNote>;
  user_hidden_recipes!: Table<UserHiddenRecipe>;
  approval_requests!: Table<ApprovalRequest>;
  recipe_photos!: Table<RecipePhoto>;
  recipe_stats!: Table<RecipeStat>;

  constructor() {
    super('RecipeVaultDB');

    // We only need to define the LATEST schema in Dexie versioning when overriding completely
    this.version(3).stores({
      // Added owner_id and visibility to indexes for fast filtering
      recipes: 'id, household_id, title, cuisine, dish_type, complexity, visibility, owner_id',
      cooking_logs: 'id, recipe_id, user_id, cooked_at',
      favorites: 'id, recipe_id, user_id',
      meal_plan: 'id, household_id, plan_date, meal_slot, recipe_id',
      user_recipe_notes: 'id, user_id, recipe_id',
      user_hidden_recipes: 'id, user_id, recipe_id',
      approval_requests: 'id, recipe_id, requested_by, status'
    });

    this.version(4).stores({
      recipe_photos: 'id, recipe_id, user_id, created_at'
    });

    // Keyed by recipe_id -- one aggregate row per recipe, replaced wholesale
    // on each sync rather than merged.
    this.version(5).stores({
      recipe_stats: 'recipe_id, cook_count, avg_rating'
    });
  }
}

export const db = new RecipeVaultDB();