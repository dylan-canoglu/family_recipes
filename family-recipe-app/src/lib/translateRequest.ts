import { supabase } from './supabase';
import { syncRecipeTranslations } from './sync';
import type { Lang } from './i18n';

// Asks the edge function to translate a recipe into every language.
//
// Fire-and-forget on purpose. Translation is a nicety; saving a family recipe
// is not. If the function is not deployed, the key is missing, the network is
// down or the model misbehaves, the recipe is already saved and the vault
// simply shows the original wording -- which is what it did before any of
// this existed. scripts/translate-recipes.mjs backfills anything missed.

export function requestRecipeTranslation(recipeId: string, currentLang?: Lang): void {
  void (async () => {
    try {
      const { error } = await supabase.functions.invoke('translate-recipe', {
        body: { recipe_id: recipeId },
      });
      if (error) {
        console.warn('Automatic translation unavailable:', error.message);
        return;
      }
      // Pull the fresh rows so the recipe reads translated straight away
      // rather than after the next visit.
      if (currentLang) await syncRecipeTranslations(currentLang);
    } catch (err) {
      console.warn('Automatic translation request failed:', err);
    }
  })();
}
