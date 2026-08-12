import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { type Recipe } from '../lib/db';
import { getVisibleRecipes } from '../lib/recipes';
import { syncRecipes } from '../lib/sync';
import { useAuth } from '../lib/AuthContext';
import { formatIngredientList } from '../lib/format';
import { isCookable } from '../lib/suggest';
import { Refrigerator, Sparkles, Clock } from 'lucide-react';

// "What can I make?" -- tap the staples currently in the kitchen and the
// vault surfaces the family recipes that use the most of them and need the
// least shopping. Matching runs on formatIngredientList output, so both the
// structured legacy imports and plain-string recipes participate.
//
// Synonyms cover English + the French/Turkish the notebooks are written in.
const STAPLES: { id: string; label: string; emoji: string; synonyms: string[] }[] = [
  { id: 'rice', label: 'Rice', emoji: '🍚', synonyms: ['rice', 'riz', 'pirinç', 'pirinc', 'pilav'] },
  { id: 'pasta', label: 'Pasta', emoji: '🍝', synonyms: ['pasta', 'makarna', 'spaghetti', 'noodle', 'pâtes', 'pates', 'vermicelli'] },
  { id: 'eggs', label: 'Eggs', emoji: '🥚', synonyms: ['egg', 'oeuf', 'œuf', 'yumurta'] },
  { id: 'ground-meat', label: 'Ground Meat / Köfte', emoji: '🥩', synonyms: ['ground beef', 'ground meat', 'minced meat', 'mince', 'kıyma', 'kiyma', 'hachée', 'hache', 'köfte', 'kofte'] },
  { id: 'chicken', label: 'Chicken', emoji: '🍗', synonyms: ['chicken', 'poulet', 'tavuk'] },
  { id: 'garlic', label: 'Garlic', emoji: '🧄', synonyms: ['garlic', 'ail', 'sarımsak', 'sarimsak'] },
  { id: 'onion', label: 'Onion', emoji: '🧅', synonyms: ['onion', 'oignon', 'soğan', 'sogan'] },
  { id: 'potato', label: 'Potato', emoji: '🥔', synonyms: ['potato', 'pomme de terre', 'patates'] },
  { id: 'tomato', label: 'Tomato', emoji: '🍅', synonyms: ['tomato', 'tomate', 'domates'] },
  { id: 'olive-oil', label: 'Olive Oil', emoji: '🫒', synonyms: ['olive oil', "huile d'olive", 'zeytinyağı', 'zeytinyagi', 'zeytin yağı'] },
  { id: 'butter', label: 'Butter', emoji: '🧈', synonyms: ['butter', 'beurre', 'tereyağı', 'tereyagi', 'tereyag'] },
  { id: 'flour', label: 'Flour', emoji: '🌾', synonyms: ['flour', 'farine'] },
  { id: 'milk', label: 'Milk', emoji: '🥛', synonyms: ['milk', 'lait', 'süt'] },
  { id: 'yogurt', label: 'Yogurt', emoji: '🥣', synonyms: ['yogurt', 'yoghurt', 'yaourt', 'yoğurt', 'yogurt'] },
  { id: 'cheese', label: 'Cheese', emoji: '🧀', synonyms: ['cheese', 'fromage', 'peynir', 'kaşar', 'kasar'] },
  { id: 'lemon', label: 'Lemon', emoji: '🍋', synonyms: ['lemon', 'citron', 'limon'] },
  { id: 'lentils', label: 'Lentils', emoji: '🫘', synonyms: ['lentil', 'lentille', 'mercimek'] },
  { id: 'bulgur', label: 'Bulgur', emoji: '🌾', synonyms: ['bulgur', 'boulgour'] },
];

interface PantryMatch {
  recipe: Recipe;
  matchedStaples: string[];
  /** Ingredient lines not covered by any selected staple. */
  missingCount: number;
  totalLines: number;
}

export function Pantry() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    syncRecipes();
  }, []);

  const recipes = useLiveQuery(() => getVisibleRecipes(user?.id), [user]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const matches: PantryMatch[] = useMemo(() => {
    if (!recipes || selected.size === 0) return [];
    const activeStaples = STAPLES.filter((s) => selected.has(s.id));

    return recipes
      .filter(isCookable)
      .map((recipe) => {
        const lines = formatIngredientList(recipe.ingredients).map((l) => l.toLowerCase());
        const matchedStaples: string[] = [];
        const coveredLines = new Set<number>();

        for (const staple of activeStaples) {
          let hit = false;
          lines.forEach((line, i) => {
            if (staple.synonyms.some((syn) => line.includes(syn))) {
              hit = true;
              coveredLines.add(i);
            }
          });
          if (hit) matchedStaples.push(staple.label);
        }

        return {
          recipe,
          matchedStaples,
          missingCount: lines.length - coveredLines.size,
          totalLines: lines.length,
        };
      })
      .filter((m) => m.matchedStaples.length > 0)
      // Most pantry coverage first; among equals, the least shopping wins.
      .sort((a, b) =>
        b.matchedStaples.length - a.matchedStaples.length ||
        a.missingCount - b.missingCount ||
        (a.recipe.total_time_min || 0) - (b.recipe.total_time_min || 0)
      )
      .slice(0, 30);
  }, [recipes, selected]);

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <Refrigerator className="w-10 h-10 text-orange-600" />
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">What Can I Make?</h1>
        </div>
        <p className="text-slate-600 mb-6">Tap what's in your kitchen — the vault finds the recipes that fit.</p>

        {/* Staple quick-select */}
        <div className="flex flex-wrap gap-2 mb-8">
          {STAPLES.map((staple) => {
            const active = selected.has(staple.id);
            return (
              <button
                key={staple.id}
                onClick={() => toggle(staple.id)}
                className={`flex items-center gap-2 px-4 min-h-[44px] rounded-full text-sm font-semibold border transition-all active:scale-95 ${
                  active
                    ? 'bg-orange-600 border-orange-600 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300'
                }`}
              >
                <span className="text-base">{staple.emoji}</span> {staple.label}
              </button>
            );
          })}
        </div>

        {selected.size === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
            <Sparkles className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            Select at least one staple to see matches.
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
            No cookable recipes use those staples yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {matches.map(({ recipe, matchedStaples, missingCount }) => (
              <li key={recipe.id}>
                <Link
                  to={`/recipes/${recipe.id}`}
                  className="block bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 line-clamp-1">{recipe.title || 'Untitled Recipe'}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {recipe.dish_type || 'Recipe'} · {recipe.complexity || 'Family recipe'}
                        {recipe.total_time_min ? (
                          <span className="inline-flex items-center gap-1 ml-2"><Clock className="w-3 h-3" />{recipe.total_time_min}m</span>
                        ) : null}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                      missingCount === 0
                        ? 'bg-green-100 text-green-700'
                        : missingCount <= 3
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}>
                      {missingCount === 0 ? 'All covered!' : `~${missingCount} more needed`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {matchedStaples.map((label) => (
                      <span key={label} className="text-[11px] font-semibold bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                        ✓ {label}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
