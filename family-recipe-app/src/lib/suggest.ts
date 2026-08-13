import { type Recipe, type RecipeStat } from './db';
import { type MealSlot } from './constants';

// The home hero isn't tied to a meal slot, so it gets its own bucket.
export type SuggestionSlot = MealSlot | 'any';

// Dish types actually present in the vault: Main Dish (39), Soup (20),
// Appetizer (15), Sauce (28), Pastry (27), Dessert (26) and Side (50).
//
// Two of those are deliberately never `primary`. `Sauce` is a component, not a
// meal. `Side` is a catch-all -- it holds whatever came through the import as
// "Other", so its contents are unpredictable and it makes a poor thing to put
// in front of someone who just wants dinner. Both still surface through
// browsing and search; they just never win a suggestion slot.
// Weights rather than primary/secondary tiers. Scoring mains and soups
// identically made suggestions come back roughly 70% soup, because soups skew
// Easy and pick up that bonus -- unrepresentative of a vault with 39 mains to
// 20 soups. A 0.6 edge to Main Dish is smaller than JITTER_WEIGHT, so soups
// still appear regularly; they just stop dominating.
//
// `Sauce` and `Side` appear nowhere. Sauce is a component rather than a meal.
// `Side` is the import's `Other` bucket and is measurably junk: all 15
// artefact titles in the vault ("Right Page", "Yellow Sticky Note",
// "Sub-recipe 2") sit in it, and 33 of its 50 entries have no real
// instructions. Both stay fully browsable and searchable; they are just never
// put in front of someone who asked what to cook.
const SLOT_DISH_WEIGHTS: Record<SuggestionSlot, Record<string, number>> = {
  dinner: { 'Main Dish': 3, Soup: 2.4 },
  lunch: { 'Main Dish': 3, Soup: 2.6, Appetizer: 1.8 },
  breakfast: { Pastry: 3, Dessert: 1.5 },
  snack: { Dessert: 3, Pastry: 2.6, Appetizer: 1.5 },
  any: { 'Main Dish': 3, Soup: 2.4, Dessert: 1.6 },
};

// A suggestion you can't actually follow is worse than no suggestion, and a
// third of the vault imported without usable instructions. Browsing and search
// still reach everything; only suggestions are held to this bar.
const MIN_INSTRUCTION_LENGTH = 40;

export function isCookable(recipe: Recipe): boolean {
  const hasSteps = String(recipe.instructions ?? '').trim().length >= MIN_INSTRUCTION_LENGTH;
  const hasIngredients = Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0;
  return hasSteps && hasIngredients;
}

const RECENTLY_COOKED_DAYS = 14;
const STALE_AFTER_DAYS = 180;

// Wide enough that most of the 39 main dishes can reach the top spot on some
// seed -- at 1.2, with a larger Easy bonus, only 6 distinct recipes ever came
// first across 40 seeds. Still below the Main Dish (3.0) to Side (1.4) gap, so
// a side can't outrank a main.
const JITTER_WEIGHT = 1.5;

// Kept deliberately small. A nudge toward the easier recipe is useful, but at
// 0.5 it outweighed jitter and the same handful of Easy mains won every time.
const EASY_BONUS = 0.25;
const HARD_PENALTY = 0.4;

export interface Suggestion {
  recipe: Recipe;
  stat?: RecipeStat;
  reason: string;
  score: number;
}

export interface RankContext {
  statsByRecipe: Map<string, RecipeStat>;
  favoriteIds: Set<string>;
  /** Recipes already committed elsewhere in the week being planned. */
  plannedIds?: Set<string>;
}

export interface RankOptions {
  slot?: SuggestionSlot;
  limit?: number;
  excludeIds?: Iterable<string>;
  /** Restricts candidates to these dish types -- used by the home lanes. */
  dishTypes?: string[];
  /** Changing this reshuffles deterministically; same seed always ranks alike. */
  seed?: number;
}

export function buildStatsMap(stats: RecipeStat[] | undefined): Map<string, RecipeStat> {
  return new Map((stats ?? []).map((s) => [s.recipe_id, s]));
}

const daysSince = (value: string | null | undefined): number => {
  if (!value) return Infinity;
  const then = new Date(value).getTime();
  return Number.isNaN(then) ? Infinity : (Date.now() - then) / 86_400_000;
};

// FNV-1a over the recipe id, mixed with the seed. Deterministic on purpose:
// Math.random() would reorder the list on every React re-render, so cards would
// visibly swap around while the user was reaching for one.
function jitter(id: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  return (hash >>> 8) / 0x01000000;
}

function scoreRecipe(recipe: Recipe, ctx: RankContext, slot: SuggestionSlot, seed: number): number {
  const dishType = recipe.dish_type || '';
  // Unlisted types (notably Sauce) score 0 here, which keeps them below the
  // 1.4 floor that jitter alone can reach.
  let score = SLOT_DISH_WEIGHTS[slot][dishType] ?? 0;

  const stat = ctx.statsByRecipe.get(recipe.id);

  // Every term below is behavioural, so on a vault with no cooking history
  // they all contribute nothing and ranking falls back to dish type,
  // complexity and jitter. That is the intended day-one behaviour.
  if (stat && stat.rating_count > 0 && stat.avg_rating != null) {
    score += stat.avg_rating - 3;
  }
  if (ctx.favoriteIds.has(recipe.id)) score += 1.5;
  if (daysSince(stat?.last_cooked_at) <= RECENTLY_COOKED_DAYS) score -= 2.5;
  if (ctx.plannedIds?.has(recipe.id)) score -= 1;

  if (recipe.complexity === 'Easy') score += EASY_BONUS;
  else if (recipe.complexity === 'Hard') score -= HARD_PENALTY;

  return score + jitter(recipe.id, seed) * JITTER_WEIGHT;
}

export function suggestionReason(recipe: Recipe, stat: RecipeStat | undefined, isFavorite: boolean): string {
  if (isFavorite) return 'Saved to your favourites';

  if (stat && stat.rating_count > 0 && stat.avg_rating != null && stat.avg_rating >= 4) {
    return `Rated ${stat.avg_rating.toFixed(1)} by the family`;
  }

  if (!stat || stat.cook_count === 0) {
    return 'No one has cooked this yet — be the first';
  }

  const idle = daysSince(stat.last_cooked_at);
  if (idle >= STALE_AFTER_DAYS) {
    return `Not cooked since ${new Date(stat.last_cooked_at!).toLocaleDateString(undefined, {
      month: 'long', year: 'numeric',
    })}`;
  }

  const type = (recipe.dish_type || 'recipe').toLowerCase();
  return `${recipe.complexity || 'Family'} ${type} the family has cooked ${stat.cook_count}×`;
}

// Scores the candidates valid for the slot and returns the best ones. Each
// slot's allowed types are wide enough in this vault that the limit is always
// reachable (dinner alone has 109 candidates across mains, soups and sides).
export function rankRecipes(recipes: Recipe[], ctx: RankContext, options: RankOptions = {}): Suggestion[] {
  const { slot = 'any', limit, excludeIds, dishTypes, seed = 0 } = options;
  const excluded = new Set(excludeIds ?? []);

  // Hard filter rather than relying on score order: an unweighted type with a
  // lucky jitter roll could otherwise creep into the tail of a list, and a
  // sauce sitting under "suggestions for dinner" reads as broken however low
  // it ranks. An explicit dishTypes request (the home lanes) overrides this.
  const allowedTypes = dishTypes ?? Object.keys(SLOT_DISH_WEIGHTS[slot]);

  const candidates = recipes.filter((recipe) => {
    if (excluded.has(recipe.id)) return false;
    if (!isCookable(recipe)) return false;
    return allowedTypes.includes(recipe.dish_type || '');
  });

  const ranked = candidates
    .map((recipe) => {
      const stat = ctx.statsByRecipe.get(recipe.id);
      return {
        recipe,
        stat,
        score: scoreRecipe(recipe, ctx, slot, seed),
        reason: suggestionReason(recipe, stat, ctx.favoriteIds.has(recipe.id)),
      };
    })
    .sort((a, b) => b.score - a.score);

  return limit == null ? ranked : ranked.slice(0, limit);
}

// Greedy pick of `count` distinct recipes for a run of slots (Plan My Week).
// After each pick the chosen dish type and cuisine are penalised so a week
// doesn't come back as seven variations on the same soup.
export function pickVariedSequence(
  recipes: Recipe[],
  ctx: RankContext,
  count: number,
  options: RankOptions = {},
): Suggestion[] {
  const chosen: Suggestion[] = [];
  const usedIds = new Set(options.excludeIds ?? []);
  const usedTypes = new Map<string, number>();
  const usedCuisines = new Map<string, number>();

  for (let i = 0; i < count; i++) {
    const ranked = rankRecipes(recipes, ctx, {
      ...options,
      excludeIds: usedIds,
      limit: undefined,
      // Vary the seed per position so identical scores don't always resolve
      // to the same recipe.
      seed: (options.seed ?? 0) + i * 7919,
    });

    let best: Suggestion | undefined;
    let bestScore = -Infinity;
    for (const candidate of ranked) {
      const type = candidate.recipe.dish_type || '';
      const cuisine = candidate.recipe.cuisine || '';
      const penalty = (usedTypes.get(type) ?? 0) * 1.5 + (usedCuisines.get(cuisine) ?? 0) * 0.75;
      const adjusted = candidate.score - penalty;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = candidate;
      }
    }

    if (!best) break;
    chosen.push(best);
    usedIds.add(best.recipe.id);
    usedTypes.set(best.recipe.dish_type || '', (usedTypes.get(best.recipe.dish_type || '') ?? 0) + 1);
    usedCuisines.set(best.recipe.cuisine || '', (usedCuisines.get(best.recipe.cuisine || '') ?? 0) + 1);
  }

  return chosen;
}

// --- Transcription gaps ----------------------------------------------------
// 110 of the imported recipes were never fully typed up from their scan: the
// page is there, the text is not. These predicates drive the "Needs
// transcription" filter so the gaps can be worked through in order instead of
// stumbled into mid-week.
//
// Thresholds deliberately match scripts/retranscribe-recipes.mjs, so the
// filter shows exactly the set that script would queue.

const PLACEHOLDER_TITLE = /^(sub-recipe|right page|left page|page \d|untitled|loose|sticky)/i;

export interface TranscriptionGaps {
  title: boolean;
  ingredients: boolean;
  instructions: boolean;
}

export function transcriptionGaps(recipe: Recipe): TranscriptionGaps {
  return {
    title: PLACEHOLDER_TITLE.test(String(recipe.title ?? '').trim()),
    ingredients: !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0,
    instructions: String(recipe.instructions ?? '').trim().length < MIN_INSTRUCTION_LENGTH,
  };
}

export function needsTranscription(recipe: Recipe): boolean {
  const gaps = transcriptionGaps(recipe);
  return gaps.title || gaps.ingredients || gaps.instructions;
}
