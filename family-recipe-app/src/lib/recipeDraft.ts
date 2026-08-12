import type { Recipe } from './db';
import { formatIngredientList } from './format';

// The editable working shape shared by the OCR Review Drawer (new recipes)
// and the admin Quick Edit dialog (existing ones). Keeping it in one place
// guarantees both paths write identical metadata to Dexie/Supabase.
export interface ScanDraftFields {
  title: string;
  cuisine: string;
  dishType: Recipe['dish_type'];
  complexity: Recipe['complexity'];
  prepTime: number;
  cookTime: number;
  servings: number;
  /** One ingredient per line in the UI; split before persisting. */
  ingredients: string;
  instructions: string;
  notes: string;
  isMainDish: boolean;
  collegeStaple: boolean;
  mealPrepFriendly: boolean;
  /** Comma-separated in the UI; split before persisting. */
  tags: string;
}

export const EMPTY_SCAN_DRAFT: ScanDraftFields = {
  title: '', cuisine: '', dishType: 'Main Dish', complexity: 'Medium',
  prepTime: 15, cookTime: 30, servings: 4,
  ingredients: '', instructions: '', notes: '',
  isMainDish: true, collegeStaple: false, mealPrepFriendly: false, tags: '',
};

export function fieldsFromRecipe(recipe: Recipe): ScanDraftFields {
  return {
    title: recipe.title || '',
    cuisine: recipe.cuisine || '',
    dishType: recipe.dish_type || 'Main Dish',
    complexity: recipe.complexity || 'Medium',
    prepTime: recipe.prep_time_min ?? 0,
    cookTime: recipe.cook_time_min ?? 0,
    servings: recipe.base_servings ?? 4,
    ingredients: formatIngredientList(recipe.ingredients).join('\n'),
    instructions: recipe.instructions || '',
    notes: recipe.notes || '',
    isMainDish: recipe.is_main_dish ?? recipe.dish_type === 'Main Dish',
    collegeStaple: recipe.college_staple ?? false,
    mealPrepFriendly: recipe.meal_prep_friendly ?? false,
    tags: (recipe.tags ?? []).join(', '),
  };
}
