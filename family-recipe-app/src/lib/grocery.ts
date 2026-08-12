import type { Recipe } from './db';
import { formatIngredientList, formatAmount, splitLeadingQuantity } from './format';

// Consolidates the ingredients of several recipes into one deduplicated
// shopping list. Ingredient text always flows through formatIngredientList
// first (the app-wide normalizer), then each line is split into
// quantity / unit / item so "2 cups flour" + "1 cup flour" becomes
// "3 cups flour" while "flour" from a third recipe still merges in.

export interface GroceryItem {
  /** Stable identity for check-off state: normalized item + unit family. */
  key: string;
  /** Ready-to-render line, e.g. "600 g ground beef" or "eggs ×2 recipes". */
  label: string;
  /** Recipe titles this line came from (deduplicated). */
  sources: string[];
}

// unit spellings -> [canonical unit, factor to base]. Mass aggregates in g,
// volume in ml; counted units (cloves, cans) aggregate per unit name.
const UNIT_ALIASES: Record<string, { unit: string; factor: number }> = {
  g: { unit: 'g', factor: 1 }, gr: { unit: 'g', factor: 1 }, gram: { unit: 'g', factor: 1 }, grams: { unit: 'g', factor: 1 }, gramme: { unit: 'g', factor: 1 }, grammes: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 }, kilogram: { unit: 'g', factor: 1000 }, kilograms: { unit: 'g', factor: 1000 }, kilo: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 }, milliliter: { unit: 'ml', factor: 1 }, milliliters: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 }, liter: { unit: 'ml', factor: 1000 }, liters: { unit: 'ml', factor: 1000 }, litre: { unit: 'ml', factor: 1000 }, litres: { unit: 'ml', factor: 1000 },
  tsp: { unit: 'tsp', factor: 1 }, teaspoon: { unit: 'tsp', factor: 1 }, teaspoons: { unit: 'tsp', factor: 1 },
  tbsp: { unit: 'tbsp', factor: 1 }, tablespoon: { unit: 'tbsp', factor: 1 }, tablespoons: { unit: 'tbsp', factor: 1 },
  cup: { unit: 'cup', factor: 1 }, cups: { unit: 'cup', factor: 1 },
  oz: { unit: 'oz', factor: 1 }, ounce: { unit: 'oz', factor: 1 }, ounces: { unit: 'oz', factor: 1 },
  lb: { unit: 'lb', factor: 1 }, lbs: { unit: 'lb', factor: 1 }, pound: { unit: 'lb', factor: 1 }, pounds: { unit: 'lb', factor: 1 },
  clove: { unit: 'clove', factor: 1 }, cloves: { unit: 'clove', factor: 1 },
  can: { unit: 'can', factor: 1 }, cans: { unit: 'can', factor: 1 },
  bunch: { unit: 'bunch', factor: 1 }, bunches: { unit: 'bunch', factor: 1 },
  pinch: { unit: 'pinch', factor: 1 }, pinches: { unit: 'pinch', factor: 1 },
  pkg: { unit: 'package', factor: 1 }, package: { unit: 'package', factor: 1 }, packages: { unit: 'package', factor: 1 }, packet: { unit: 'package', factor: 1 }, packets: { unit: 'package', factor: 1 },
};

// "100g almonds" and "100 g almonds" both parse: quantity splitting already
// happened, so here the line starts with an (optional) unit word.
const UNIT_RE = new RegExp(String.raw`^(${Object.keys(UNIT_ALIASES).join('|')})\b\.?\s*(?:of\s+)?`, 'i');

function extractUnit(rest: string): { unit: string | null; factor: number; remainder: string } {
  const match = rest.match(UNIT_RE);
  if (!match) return { unit: null, factor: 1, remainder: rest };
  const alias = UNIT_ALIASES[match[1].toLowerCase()];
  return { unit: alias.unit, factor: alias.factor, remainder: rest.slice(match[0].length).trim() };
}

// Reduce "Flour, sifted (see note)" to "flour" so recipe-to-recipe phrasing
// differences still merge. Deliberately conservative: no stemming beyond a
// naive trailing-s strip on longer words.
export function normalizeItemName(raw: string): string {
  let item = raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/,|;| - /)[0]
    .replace(/[.*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (item.length > 4 && item.endsWith('s') && !item.endsWith('ss')) item = item.slice(0, -1);
  return item;
}

interface Bucket {
  /** Normalized form -- merge identity only, never displayed. */
  item: string;
  /** First-seen human wording, so the list reads "olives", not "olive". */
  display: string;
  unit: string | null;
  total: number;
  /** Count of lines that carried no parseable amount. */
  unquantified: number;
  sources: Set<string>;
}

export function buildGroceryList(recipes: Recipe[]): GroceryItem[] {
  const buckets = new Map<string, Bucket>();

  for (const recipe of recipes) {
    const title = recipe.title || 'Untitled Recipe';
    for (const line of formatIngredientList(recipe.ingredients)) {
      const { quantity, rest } = splitLeadingQuantity(line);
      const { unit, factor, remainder } = extractUnit(rest);
      const display = (remainder || rest).trim();
      const item = normalizeItemName(display);
      if (!item) continue;

      // Bucket by item + unit family: "2 cups flour" and "1 cup flour" merge,
      // while "2 cups flour" vs "100 g flour" stay separate lines -- honest
      // about what's actually known rather than guessing at conversions.
      const key = `${item}|${unit ?? '#'}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { item, display, unit, total: 0, unquantified: 0, sources: new Set() };
        buckets.set(key, bucket);
      }
      if (quantity != null) bucket.total += quantity * factor;
      else bucket.unquantified += 1;
      bucket.sources.add(title);
    }
  }

  return Array.from(buckets.entries())
    .map(([key, b]) => {
      let label: string;
      if (b.total > 0) {
        const amount = b.unit === 'g' || b.unit === 'ml'
          ? `${formatAmount(Math.round(b.total))} ${b.unit}`
          : `${formatAmount(b.total)}${b.unit ? ` ${b.unit}${b.total > 1 && !b.unit.endsWith('s') && !['g', 'ml', 'oz', 'lb', 'tsp', 'tbsp'].includes(b.unit) ? 's' : ''}` : ''}`;
        label = `${amount} ${b.display}`;
        if (b.unquantified > 0) label += ' (+ some to taste)';
      } else {
        label = b.display;
        if (b.sources.size > 1) label += ` (×${b.sources.size} recipes)`;
      }
      return { key, label, sources: Array.from(b.sources).sort() };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
