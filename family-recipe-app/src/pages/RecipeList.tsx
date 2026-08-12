import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db, type Recipe } from '../lib/db';
import { supabase } from '../lib/supabase';
import { getVisibleRecipes, updateRecipeInCloud } from '../lib/recipes';
import { isCookable } from '../lib/suggest';
import { syncRecipes } from '../lib/sync';
import { useAuth } from '../lib/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import {
  ChefHat, Clock, Search, ClipboardCheck, ShoppingCart,
  Edit3, EyeOff, Trash2, GraduationCap, X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';
import { RecipeQuickEditDialog } from '../components/RecipeQuickEditDialog';
import { type ScanDraftFields } from '../lib/recipeDraft';

// The smart pills. Most of the vault predates the v6 metadata, so each filter
// pairs the explicit flag with a sensible fallback for unclassified rows --
// an unclassified vault must not make the pills look broken/empty.
type SmartFilter = 'all' | 'college' | 'mains' | 'classics';

const QUICK_TOTAL_MIN = 45;

const SMART_FILTERS: { id: SmartFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'college', label: '🎓 College Staples' },
  { id: 'mains', label: 'Genuine Mains' },
  { id: 'classics', label: 'Family Classics' },
];

function matchesSmartFilter(recipe: Recipe, filter: SmartFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'college':
      // Quick & meal-prep: explicitly flagged, or (until classified) a
      // cookable dish that fits a weeknight.
      return recipe.college_staple === true || recipe.meal_prep_friendly === true ||
        (recipe.college_staple == null && isCookable(recipe) &&
          (recipe.total_time_min || 0) > 0 && (recipe.total_time_min || 0) <= QUICK_TOTAL_MIN &&
          ['Main Dish', 'Soup'].includes(recipe.dish_type || ''));
    case 'mains':
      // An explicit false always excludes; unclassified falls back to a
      // cookable Main Dish (filters out the "Right Page"-style import junk).
      if (recipe.is_main_dish === false) return false;
      return recipe.is_main_dish === true || (recipe.dish_type === 'Main Dish' && isCookable(recipe));
    case 'classics':
      return recipe.source_type === 'family';
  }
}

// Default catalog order: complete, efficient main-course cooking floats up;
// unclassified filler sinks without being hidden.
function emphasisScore(recipe: Recipe): number {
  let score = 0;
  if (isCookable(recipe)) score += 4;
  if (recipe.is_main_dish === true || recipe.dish_type === 'Main Dish') score += 2;
  if (recipe.college_staple === true) score += 2;
  if (recipe.meal_prep_friendly === true) score += 1;
  const total = recipe.total_time_min || 0;
  if (total > 0 && total <= QUICK_TOTAL_MIN) score += 1;
  return score;
}

type ViewMode = 'browse' | 'review' | 'shop';

interface DialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function RecipeList() {
  const { user, isAdmin, isGuest } = useAuth();
  const navigate = useNavigate();
  // Home's lane headers deep-link here pre-filtered, e.g. /recipes?dish=Soup.
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDishType, setFilterDishType] = useState(searchParams.get('dish') ?? '');
  const [filterComplexity, setFilterComplexity] = useState('');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>(
    (searchParams.get('f') as SmartFilter) || 'all'
  );

  const [mode, setMode] = useState<ViewMode>('browse');
  const [shopSelection, setShopSelection] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Keep the URL in step so the filtered view can be shared or reloaded.
  const changeDishType = (value: string) => {
    setFilterDishType(value);
    if (value) searchParams.set('dish', value);
    else searchParams.delete('dish');
    setSearchParams(searchParams, { replace: true });
  };

  const changeSmartFilter = (value: SmartFilter) => {
    setSmartFilter(value);
    if (value !== 'all') searchParams.set('f', value);
    else searchParams.delete('f');
    setSearchParams(searchParams, { replace: true });
  };

  // 1. Query the LOCAL database safely
  const recipes = useLiveQuery(async () => {
    try {
      // Trash / hidden / ownership rules live in getVisibleRecipes so every
      // screen applies them identically; only the search filters are local.
      const visibleRecipes = await getVisibleRecipes(user?.id);

      const filtered = visibleRecipes.filter(recipe => {
        // Safe User Filters (using fallbacks so it never crashes on undefined)
        const safeTitle = recipe.title || '';
        const matchesSearch = safeTitle.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDish = filterDishType ? recipe.dish_type === filterDishType : true;
        const matchesComplexity = filterComplexity ? recipe.complexity === filterComplexity : true;

        return matchesSearch && matchesDish && matchesComplexity && matchesSmartFilter(recipe, smartFilter);
      });

      // Emphasis ordering only while browsing untargeted; an explicit search
      // reads better alphabetical.
      if (searchTerm.trim()) {
        return filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      }
      return filtered.sort((a, b) =>
        emphasisScore(b) - emphasisScore(a) || (a.title || '').localeCompare(b.title || '')
      );
    } catch (err) {
      console.error("Dexie query failed:", err);
      return []; // Return empty array instead of crashing
    }
  }, [searchTerm, filterDishType, filterComplexity, smartFilter, user]);

  // Display thumbnails come from recipe_photos (photos of the finished dish),
  // never from image_path -- that's the archival notebook scan.
  const photos = useLiveQuery(() => db.recipe_photos.toArray(), []);
  const thumbByRecipe = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos ?? []) {
      if (!map.has(photo.recipe_id)) map.set(photo.recipe_id, photo.image_path);
    }
    return map;
  }, [photos]);

  useEffect(() => {
    if (user || isGuest) syncRecipes();
  }, [user, isGuest]);

  // --- Review sweep actions (admin only) ---

  const handleQuickEditSave = async (fields: ScanDraftFields) => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const changes = {
        title: fields.title.trim(),
        cuisine: fields.cuisine.trim() || null,
        dish_type: fields.dishType,
        complexity: fields.complexity,
        prep_time_min: Number(fields.prepTime) || 0,
        cook_time_min: Number(fields.cookTime) || 0,
        base_servings: Number(fields.servings) || 1,
        ingredients: fields.ingredients.split('\n').map((i) => i.trim()).filter((i) => i !== ''),
        instructions: fields.instructions,
        notes: fields.notes,
        is_main_dish: fields.isMainDish,
        college_staple: fields.collegeStaple,
        meal_prep_friendly: fields.mealPrepFriendly,
        tags: fields.tags.split(',').map((t) => t.trim()).filter((t) => t !== ''),
        updated_at: new Date().toISOString(),
      };
      // total_time_min is GENERATED ALWAYS in Supabase; computed locally only.
      await db.recipes.update(editing.id, {
        ...changes,
        total_time_min: (Number(fields.prepTime) || 0) + (Number(fields.cookTime) || 0),
      });
      const { error, strippedMetadata } = await updateRecipeInCloud(editing.id, changes);
      if (error) {
        console.error('Cloud update failed:', error);
        showToast('Saved locally — cloud update failed, it will need re-syncing.');
      } else if (strippedMetadata) {
        showToast('Saved — run supabase-college-metadata.sql to sync metadata fields.');
      } else {
        showToast('Recipe updated.');
      }
      setEditing(null);
    } finally {
      setSavingEdit(false);
    }
  };

  // Soft-hide for this user -- the sweep's "mark junk" action. Reversible
  // from the recipe page, so no confirmation dialog slowing the sweep down.
  const handleHide = async (recipe: Recipe) => {
    if (!user) return;
    const record = { id: uuidv4(), user_id: user.id, recipe_id: recipe.id, created_at: new Date().toISOString() };
    await db.user_hidden_recipes.put(record);
    await supabase.from('user_hidden_recipes').insert(record);
    showToast(`Hidden: ${recipe.title || 'recipe'}`);
  };

  const handleDelete = (recipe: Recipe) => {
    setDialog({
      title: 'Move to Trash',
      message: `Move "${recipe.title || 'this recipe'}" to the trash? It disappears for the whole family, and its favorites and meal-plan entries are removed.`,
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async () => {
        const now = new Date().toISOString();
        await db.recipes.update(recipe.id, { deleted_at: now });
        await supabase.from('recipes').update({ deleted_at: now }).eq('id', recipe.id);

        // Clean up references so nothing dangles: favorites (everyone's) and
        // meal plan slots pointing at a recipe that no longer exists.
        const orphanedFavorites = await db.favorites.where('recipe_id').equals(recipe.id).toArray();
        await db.favorites.bulkDelete(orphanedFavorites.map((f) => f.id));
        await supabase.from('favorites').delete().eq('recipe_id', recipe.id);

        const orphanedPlans = await db.meal_plan.where('recipe_id').equals(recipe.id).toArray();
        await db.meal_plan.bulkDelete(orphanedPlans.map((p) => p.id));
        await supabase.from('meal_plan').delete().eq('recipe_id', recipe.id);

        setDialog(null);
        showToast('Moved to trash.');
      },
    });
  };

  // --- Shop selection ---

  const toggleShopRecipe = (id: string) => {
    setShopSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startShoppingList = () => {
    if (shopSelection.size === 0) return;
    navigate(`/shopping?ids=${Array.from(shopSelection).join(',')}`);
  };

  const setViewMode = (next: ViewMode) => {
    setMode((current) => (current === next ? 'browse' : next));
    setShopSelection(new Set());
  };

  if (!recipes) {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50">
        <p className="text-xl text-slate-600 animate-pulse">Unlocking the vault...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* Sticky smart filter bar: pinned to the top of the scroll region. */}
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-12 py-2 flex gap-2 overflow-x-auto">
          {SMART_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => changeSmartFilter(id)}
              className={`shrink-0 px-4 min-h-[44px] rounded-full text-sm font-semibold transition-all active:scale-95 ${
                smartFilter === id
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-12 pt-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <ChefHat className="w-10 h-10 text-orange-600" />
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900">The Vault</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('shop')}
                className={`flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                  mode === 'shop'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-green-400'
                }`}
              >
                <ShoppingCart className="w-4 h-4" /> {mode === 'shop' ? 'Selecting…' : 'Shop'}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setViewMode('review')}
                  className={`flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                    mode === 'review'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" /> Review Mode
                </button>
              )}
            </div>
          </div>

          {mode === 'review' && (
            <p className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-xl p-3">
              Sweep mode: work through the vault card by card — fix metadata with <strong>Edit</strong>, soft-hide junk with <strong>Hide</strong>, or <strong>Delete</strong> broken imports.
            </p>
          )}
          {mode === 'shop' && (
            <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-100 rounded-xl p-3">
              Tap recipes to add them to a consolidated shopping list.
            </p>
          )}

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search recipes..."
                className="w-full pl-10 pr-4 py-2 min-h-[44px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="border border-slate-200 rounded-lg px-4 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={filterDishType}
              onChange={(e) => changeDishType(e.target.value)}
            >
              <option value="">All Dish Types</option>
              <option value="Main Dish">Main Dish</option>
              <option value="Appetizer">Appetizer</option>
              <option value="Dessert">Dessert</option>
              <option value="Pastry">Pastry</option>
              <option value="Soup">Soup</option>
              <option value="Sauce">Sauce</option>
              <option value="Side">Side</option>
            </select>
            <select
              className="border border-slate-200 rounded-lg px-4 py-2 min-h-[44px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={filterComplexity}
              onChange={(e) => setFilterComplexity(e.target.value)}
            >
              <option value="">All Complexities</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          <p className="text-slate-600 mb-6 font-medium">
            Showing {recipes.length} recipes
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
            {recipes.map((recipe) => {
              const thumb = thumbByRecipe.get(recipe.id);
              const selected = shopSelection.has(recipe.id);
              const card = (
                <>
                  {recipe.visibility === 'personal' && (
                    <div className="absolute top-3 left-3 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded shadow-sm z-10">
                      DRAFT
                    </div>
                  )}
                  {selected && (
                    <div className="absolute inset-0 bg-green-600/10 border-2 border-green-500 rounded-xl z-10 pointer-events-none" />
                  )}

                  <div className="h-40 bg-slate-100 w-full flex items-center justify-center border-b border-slate-100 group-hover:bg-orange-50 transition-colors overflow-hidden">
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <ChefHat className="w-8 h-8 text-slate-300 group-hover:text-orange-200 transition-colors" />
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-1 rounded">
                        {recipe.dish_type || 'Uncategorized'}
                      </span>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        recipe.complexity === 'Easy' ? 'bg-green-100 text-green-700' :
                        recipe.complexity === 'Medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {recipe.complexity || 'Unknown'}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-orange-600 transition-colors">
                      {recipe.title || 'Untitled Recipe'}
                    </h3>

                    <div className="flex items-center flex-wrap text-sm text-slate-500 gap-x-4 gap-y-1 mt-3">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{recipe.total_time_min || 0}m</span>
                      </div>
                      {recipe.college_staple && (
                        <span className="flex items-center gap-1 text-green-700"><GraduationCap className="w-4 h-4" /> Staple</span>
                      )}
                      {recipe.cuisine && (
                        <span className="truncate">• {recipe.cuisine}</span>
                      )}
                    </div>

                    {(recipe.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {recipe.tags!.slice(0, 4).map((tag) => (
                          <span key={tag} className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );

              const cardClass =
                'bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all block group relative';

              return (
                <div key={recipe.id} className="relative">
                  {mode === 'shop' ? (
                    <button onClick={() => toggleShopRecipe(recipe.id)} className={`${cardClass} w-full text-left`}>
                      {card}
                    </button>
                  ) : (
                    <Link to={`/recipes/${recipe.id}`} className={cardClass}>
                      {card}
                    </Link>
                  )}

                  {/* Review-mode quick actions */}
                  {mode === 'review' && (
                    <div className="flex items-stretch border border-t-0 border-slate-200 rounded-b-xl overflow-hidden -mt-2 relative z-10 bg-white divide-x divide-slate-100 shadow-sm">
                      <button
                        onClick={() => setEditing(recipe)}
                        className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleHide(recipe)}
                        className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        <EyeOff className="w-4 h-4" /> Hide
                      </button>
                      <button
                        onClick={() => handleDelete(recipe)}
                        className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {recipes.length === 0 && (
            <div className="text-center py-20 text-slate-500">
              No recipes match your current filters.
            </div>
          )}
        </div>
      </div>

      {/* Floating action bar while building a shopping selection */}
      {mode === 'shop' && shopSelection.size > 0 && (
        <div className="sticky bottom-4 z-40 flex justify-center px-4">
          <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-semibold">{shopSelection.size} selected</span>
            <button
              onClick={startShoppingList}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 active:scale-95 transition-all px-4 py-2 min-h-[44px] rounded-xl text-sm font-bold"
            >
              <ShoppingCart className="w-4 h-4" /> Build shopping list
            </button>
            <button onClick={() => setShopSelection(new Set())} title="Clear selection" className="p-2 text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <RecipeQuickEditDialog
        recipe={editing}
        saving={savingEdit}
        onSave={handleQuickEditSave}
        onCancel={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel}
        danger={dialog?.danger}
        onConfirm={() => dialog?.onConfirm()}
        onCancel={() => setDialog(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
