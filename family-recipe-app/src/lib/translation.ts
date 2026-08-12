import { db, type Recipe, type RecipeTranslation } from './db';
import type { Lang } from './i18n';

// Picking which words to show for a recipe.
//
// The vault is mostly French and Turkish, a minority has English, and now
// some rows have proper translations. The rule below is deliberately
// per-field rather than per-recipe: a translation that covers the
// instructions but not the notes should still be used for the instructions,
// instead of throwing the whole thing away.

export interface ResolvedRecipeText {
  title: string;
  /** Whatever shape the source had -- formatIngredientList normalizes it. */
  ingredients: unknown;
  instructions: string | null | undefined;
  notes: string | null | undefined;
  /** True when at least one field came from a translation. */
  isTranslated: boolean;
  /** True when a translation exists for the requested language. */
  hasTranslation: boolean;
}

const isFilled = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/**
 * Resolve the text to display.
 *
 * @param preferOriginal when the reader has explicitly asked for the
 *   original wording, which always wins over any translation.
 */
export function resolveRecipeText(
  recipe: Recipe,
  translation: RecipeTranslation | undefined,
  lang: Lang,
  preferOriginal = false,
): ResolvedRecipeText {
  // The legacy English columns are a translation too -- treat them as one so
  // the 52 recipes carrying them work before the batch script has ever run.
  const legacyEnglish: RecipeTranslation | undefined =
    lang === 'en' && (isFilled(recipe.instructions_en) || isFilled(recipe.ingredients_en))
      ? {
          recipe_id: recipe.id,
          lang: 'en',
          ingredients: recipe.ingredients_en ?? null,
          instructions: recipe.instructions_en ?? null,
        }
      : undefined;

  const source = translation ?? legacyEnglish;
  const hasTranslation = !!source;

  if (!source || preferOriginal) {
    return {
      title: recipe.title || '',
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      notes: recipe.notes,
      isTranslated: false,
      hasTranslation,
    };
  }

  // Field by field, so a half-finished translation degrades gracefully.
  const title = isFilled(source.title) ? source.title! : recipe.title || '';
  const ingredients = isFilled(source.ingredients) ? source.ingredients : recipe.ingredients;
  const instructions = isFilled(source.instructions) ? source.instructions : recipe.instructions;
  const notes = isFilled(source.notes) ? source.notes : recipe.notes;

  return {
    title,
    ingredients,
    instructions,
    notes,
    isTranslated:
      isFilled(source.title) || isFilled(source.ingredients) ||
      isFilled(source.instructions) || isFilled(source.notes),
    hasTranslation,
  };
}

/** All translations for one language, keyed by recipe id. */
export async function loadTranslationMap(lang: Lang): Promise<Map<string, RecipeTranslation>> {
  const rows = await db.recipe_translations.where('lang').equals(lang).toArray();
  return new Map(rows.map((row) => [row.recipe_id, row]));
}

/**
 * Just the display title, for lists and cards.
 *
 * Falls back to the original title rather than to a placeholder: a French
 * title is far more use to someone than "Untitled Recipe".
 */
export function translatedTitle(
  recipe: Recipe,
  translations: Map<string, RecipeTranslation> | undefined,
): string {
  // The map is already scoped to one language by loadTranslationMap.
  const row = translations?.get(recipe.id);
  if (row && isFilled(row.title)) return row.title!;
  return recipe.title || '';
}
