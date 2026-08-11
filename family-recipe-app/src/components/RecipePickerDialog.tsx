import { useEffect, useMemo, useState } from 'react';
import { X, Search, Clock } from 'lucide-react';
import { type Recipe } from '../lib/db';

interface RecipePickerDialogProps {
  open: boolean;
  title: string;
  recipes: Recipe[];
  onPick: (recipe: Recipe) => void;
  onCancel: () => void;
}

// Rendering all ~200 recipes at once is wasteful when the search box is the
// point; show a slice and let typing narrow it.
const VISIBLE_LIMIT = 40;

export function RecipePickerDialog({ open, title, recipes, onPick, onCancel }: RecipePickerDialogProps) {
  const [search, setSearch] = useState('');

  // Start each visit with a clean search rather than the last one's leftovers.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? recipes.filter((r) => (r.title || '').toLowerCase().includes(term))
      : recipes;
    return [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [recipes, search]);

  if (!open) return null;

  const shown = matches.slice(0, VISIBLE_LIMIT);

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
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="overflow-y-auto p-3">
          {shown.length === 0 ? (
            <p className="text-slate-500 text-center py-8 text-sm">No recipes match that search.</p>
          ) : (
            <ul className="space-y-1">
              {shown.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    onClick={() => onPick(recipe)}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-orange-50 transition-colors group"
                  >
                    <span className="block font-semibold text-slate-800 group-hover:text-orange-700 line-clamp-1">
                      {recipe.title || 'Untitled Recipe'}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>{recipe.dish_type || 'Uncategorized'}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {recipe.total_time_min || 0}m
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {matches.length > shown.length && (
          <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-500 text-center">
            Showing {shown.length} of {matches.length} — keep typing to narrow it down.
          </div>
        )}
      </div>
    </div>
  );
}
