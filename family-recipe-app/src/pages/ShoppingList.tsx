import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { db, type Recipe } from '../lib/db';
import { getVisibleRecipes } from '../lib/recipes';
import { syncMealPlan, syncRecipes } from '../lib/sync';
import { useAuth } from '../lib/AuthContext';
import { buildGroceryList } from '../lib/grocery';
import { ShoppingCart, Plus, X, Search, CalendarDays, Trash2, CheckCircle2 } from 'lucide-react';

// One-tap smart grocery aggregator: pick recipes (from here, from the
// catalog's Shop mode, or straight from the week's meal plan) and get a
// consolidated, deduplicated list with in-store checkboxes. Selection and
// checked-off state live in localStorage so the list survives the drive to
// the store -- and works offline there, like the rest of the vault.

const STORAGE_KEY = 'vault-shopping-v1';

interface StoredState {
  ids: string[];
  checked: Record<string, boolean>;
}

function loadStored(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.ids)) return { ids: parsed.ids, checked: parsed.checked ?? {} };
    }
  } catch { /* corrupted state is disposable */ }
  return { ids: [], checked: {} };
}

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function ShoppingList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL ids (arriving from the catalog's Shop mode) merge into the stored
  // selection once, then the URL is cleaned so refreshes don't re-add.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const stored = loadStored();
    const fromUrl = (searchParams.get('ids') ?? '').split(',').filter(Boolean);
    return Array.from(new Set([...stored.ids, ...fromUrl]));
  });
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadStored().checked);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('ids')) {
      searchParams.delete('ids');
      setSearchParams(searchParams, { replace: true });
    }
    syncRecipes();
    if (user) syncMealPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: selectedIds, checked }));
  }, [selectedIds, checked]);

  const recipes = useLiveQuery(() => getVisibleRecipes(user?.id), [user]);
  const planEntries = useLiveQuery(() => db.meal_plan.toArray(), []);

  const byId = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes]);
  const selectedRecipes = useMemo(
    () => selectedIds.map((id) => byId.get(id)).filter((r): r is Recipe => !!r),
    [selectedIds, byId]
  );

  const groceryItems = useMemo(() => buildGroceryList(selectedRecipes), [selectedRecipes]);

  const toggleRecipe = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Pull in everything planned for the next 7 days, starting today.
  const addThisWeek = () => {
    const today = new Date();
    const weekDates = new Set(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return toISODate(d);
    }));
    const weekIds = (planEntries ?? [])
      .filter((e) => weekDates.has(String(e.plan_date).slice(0, 10)))
      .map((e) => e.recipe_id)
      .filter((id) => byId.has(id));
    setSelectedIds((ids) => Array.from(new Set([...ids, ...weekIds])));
  };

  const clearAll = () => {
    setSelectedIds([]);
    setChecked({});
  };

  const checkedCount = groceryItems.filter((item) => checked[item.key]).length;

  const pickerMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pool = (recipes ?? []).filter((r) => !selectedIds.includes(r.id));
    if (!term) return pool.slice(0, 20);
    return pool.filter((r) => (r.title || '').toLowerCase().includes(term)).slice(0, 20);
  }, [recipes, search, selectedIds]);

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <ShoppingCart className="w-10 h-10 text-orange-600" />
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Shopping List</h1>
        </div>
        <p className="text-slate-600 mb-6">
          Pick recipes and get one consolidated list — same ingredients across recipes are merged.
        </p>

        {/* Selected recipes */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-bold text-slate-800">Recipes ({selectedRecipes.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={addThisWeek}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 min-h-[44px] rounded-lg active:scale-95 transition-all"
              >
                <CalendarDays className="w-4 h-4" /> Add this week's plan
              </button>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                className="flex items-center gap-1.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 min-h-[44px] rounded-lg active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" /> Add recipes
              </button>
            </div>
          </div>

          {selectedRecipes.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">
              Nothing selected yet — add recipes here, or use <strong>Shop</strong> mode in the Vault.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {selectedRecipes.map((recipe) => (
                <li key={recipe.id} className="flex items-center gap-1 bg-orange-50 border border-orange-100 text-orange-800 rounded-full pl-3 pr-1 py-1 text-sm font-medium">
                  <Link to={`/recipes/${recipe.id}`} className="hover:underline">
                    {recipe.title || 'Untitled Recipe'}
                  </Link>
                  <button onClick={() => toggleRecipe(recipe.id)} title="Remove" className="p-1.5 rounded-full hover:bg-orange-100">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pickerOpen && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search the vault…"
                  className="w-full pl-9 pr-4 py-2 min-h-[44px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                {pickerMatches.map((recipe) => (
                  <li key={recipe.id}>
                    <button
                      onClick={() => toggleRecipe(recipe.id)}
                      className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-orange-50 rounded-lg transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="font-medium text-slate-700 line-clamp-1">{recipe.title || 'Untitled Recipe'}</span>
                      <Plus className="w-4 h-4 text-orange-500 shrink-0" />
                    </button>
                  </li>
                ))}
                {pickerMatches.length === 0 && (
                  <li className="text-sm text-slate-400 px-3 py-4 text-center">No matches.</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* The consolidated list */}
        {groceryItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                {checkedCount} / {groceryItems.length} in the cart
              </h2>
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:bg-red-50 px-3 min-h-[44px] rounded-lg active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" /> Clear list
              </button>
            </div>
            <ul className="divide-y divide-slate-50">
              {groceryItems.map((item) => (
                <li key={item.key}>
                  <label className="flex items-start gap-3 px-2 py-3 min-h-[44px] cursor-pointer hover:bg-slate-50 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      checked={!!checked[item.key]}
                      onChange={() => setChecked((c) => ({ ...c, [item.key]: !c[item.key] }))}
                      className="mt-0.5 w-5 h-5 accent-green-600 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className={`block font-medium ${checked[item.key] ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                        {item.label}
                      </span>
                      <span className="block text-xs text-slate-400 truncate">
                        {item.sources.join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
