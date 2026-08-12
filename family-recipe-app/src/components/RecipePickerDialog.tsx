import { useEffect, useMemo, useState } from 'react';
import { X, Search, Sparkles, Shuffle } from 'lucide-react';
import { type Recipe } from '../lib/db';
import { type Suggestion } from '../lib/suggest';

interface RecipePickerDialogProps {
  open: boolean;
  title: string;
  /** Ranked, slot-appropriate picks shown before the user types anything. */
  suggestions: Suggestion[];
  /** Everything, for when the suggestions aren't what they had in mind. */
  allRecipes: Recipe[];
  onPick: (recipe: Recipe) => void;
  onReshuffle: () => void;
  onCancel: () => void;
}

// Only reached once someone starts searching; the suggestion list is short by
// design, and rendering all ~200 alternatives at once is wasted work.
const SEARCH_LIMIT = 40;

export function RecipePickerDialog({
  open, title, suggestions, allRecipes, onPick, onReshuffle, onCancel,
}: RecipePickerDialogProps) {
  const [search, setSearch] = useState('');

  // Start each visit on the suggestions rather than the last search.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return allRecipes
      .filter((r) => (r.title || '').toLowerCase().includes(term))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [allRecipes, search]);

  if (!open) return null;

  const searching = search.trim().length > 0;
  const shown = searching ? matches.slice(0, SEARCH_LIMIT) : [];

  const Row = ({ recipe, note }: { recipe: Recipe; note: string }) => (
    <li>
      <button
        onClick={() => onPick(recipe)}
        className="w-full text-left px-4 py-3 rounded-lg hover:bg-orange-50 transition-colors group"
      >
        <span className="block font-semibold text-slate-800 group-hover:text-orange-700 line-clamp-1">
          {recipe.title || 'Untitled Recipe'}
        </span>
        <span className="block text-xs text-slate-500 mt-1">{note}</span>
      </button>
    </li>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-100 flex flex-col max-h-[80vh]">
        <div className="p-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Search is deliberately secondary: the point is to not have to
              think of a recipe, so the ranked picks come first. */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Or search all recipes..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="overflow-y-auto p-3">
          {searching ? (
            shown.length === 0 ? (
              <p className="text-slate-500 text-center py-8 text-sm">No recipes match that search.</p>
            ) : (
              <ul className="space-y-1">
                {shown.map((recipe) => (
                  <Row
                    key={recipe.id}
                    recipe={recipe}
                    note={`${recipe.dish_type || 'Recipe'} · ${recipe.complexity || 'Family recipe'}`}
                  />
                ))}
              </ul>
            )
          ) : suggestions.length === 0 ? (
            <p className="text-slate-500 text-center py-8 text-sm">No suggestions available.</p>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Suggested for this meal
                </span>
                <button
                  onClick={onReshuffle}
                  className="text-xs font-semibold text-slate-500 hover:text-orange-600 flex items-center gap-1 transition-colors"
                >
                  <Shuffle className="w-3.5 h-3.5" /> Shuffle
                </button>
              </div>
              <ul className="space-y-1">
                {suggestions.map(({ recipe, reason }) => (
                  <Row
                    key={recipe.id}
                    recipe={recipe}
                    note={`${recipe.dish_type || 'Recipe'} · ${recipe.complexity || 'Family recipe'} — ${reason}`}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        {searching && matches.length > shown.length && (
          <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-500 text-center">
            Showing {shown.length} of {matches.length} — keep typing to narrow it down.
          </div>
        )}
      </div>
    </div>
  );
}
