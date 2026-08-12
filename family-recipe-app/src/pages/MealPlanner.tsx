import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db, type MealPlan, type Recipe } from '../lib/db';
import { supabase } from '../lib/supabase';
import { getVisibleRecipes } from '../lib/recipes';
import { syncMealPlan, syncRecipeStats, syncRecipes } from '../lib/sync';
import { buildStatsMap, pickVariedSequence, rankRecipes, type RankContext } from '../lib/suggest';
import { useAuth } from '../lib/AuthContext';
import { useT } from '../lib/i18n';
import { HOUSEHOLD_ID, MEAL_SLOTS, type MealSlot } from '../lib/constants';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Shuffle, Wand2, ShoppingCart } from 'lucide-react';
import { RecipePickerDialog } from '../components/RecipePickerDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

// Local-date formatting on purpose: toISOString() converts to UTC first, which
// silently shifts the plan by a day for anyone west of Greenwich.
const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Weeks run Monday to Sunday.
const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// How many ranked picks the slot picker shows before falling back to search.
const SUGGESTION_COUNT = 6;

export function MealPlanner() {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [picking, setPicking] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; title: string } | null>(null);
  const [confirmPlanWeek, setConfirmPlanWeek] = useState(false);
  const [pickerSeed, setPickerSeed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // The plan is shared, so pull whatever the rest of the family has changed.
  useEffect(() => {
    if (user) {
      syncRecipes();
      syncMealPlan();
      syncRecipeStats();
    }
  }, [user]);

  const recipes = useLiveQuery(() => getVisibleRecipes(user?.id), [user]);
  // The page already refuses to render without a user; this keeps the query
  // itself from reading cached household data too.
  const entries = useLiveQuery(() => (user ? db.meal_plan.toArray() : []), [user]);
  const stats = useLiveQuery(() => db.recipe_stats.toArray(), []);
  const favorites = useLiveQuery(
    () => (user ? db.favorites.where({ user_id: user.id }).toArray() : []),
    [user]
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayISO = toISODate(new Date());

  const recipesById = new Map((recipes ?? []).map((r) => [r.id, r]));

  // date -> slot -> entry, so each cell is a direct lookup.
  const planned = new Map<string, Partial<Record<MealSlot, { id: string; recipe?: Recipe }>>>();
  for (const entry of entries ?? []) {
    const date = String(entry.plan_date).slice(0, 10);
    const slot = entry.meal_slot as MealSlot;
    if (!planned.has(date)) planned.set(date, {});
    planned.get(date)![slot] = { id: entry.id, recipe: recipesById.get(entry.recipe_id) };
  }

  // Recipes already spoken for this week, so suggestions don't repeat what is
  // already on the board.
  const weekRecipeIds = useMemo(() => {
    const weekDates = new Set(Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i))));
    return new Set(
      (entries ?? [])
        .filter((e) => weekDates.has(String(e.plan_date).slice(0, 10)))
        .map((e) => e.recipe_id)
    );
  }, [entries, weekStart]);

  const ctx: RankContext = useMemo(() => ({
    statsByRecipe: buildStatsMap(stats),
    favoriteIds: new Set((favorites ?? []).map((f) => f.recipe_id)),
    plannedIds: weekRecipeIds,
  }), [stats, favorites, weekRecipeIds]);

  const suggestions = useMemo(() => {
    if (!picking || !recipes) return [];
    return rankRecipes(recipes, ctx, {
      slot: picking.slot,
      limit: SUGGESTION_COUNT,
      excludeIds: weekRecipeIds,
      seed: pickerSeed,
    });
  }, [picking, recipes, ctx, weekRecipeIds, pickerSeed]);

  const writeEntries = async (newEntries: MealPlan[], replacing: MealPlan[]) => {
    for (const stale of replacing) {
      await db.meal_plan.delete(stale.id);
      await supabase.from('meal_plan').delete().eq('id', stale.id);
    }
    // Local first so planning works without a connection.
    await db.meal_plan.bulkPut(newEntries);
    const { error } = await supabase.from('meal_plan').insert(newEntries);
    if (error) {
      console.error('Failed to push meal plan entries to cloud:', error);
      showToast('Saved locally — it will need re-syncing.');
      return false;
    }
    return true;
  };

  const buildEntry = (date: string, slot: MealSlot, recipeId: string): MealPlan => ({
    id: uuidv4(),
    household_id: HOUSEHOLD_ID,
    plan_date: date,
    meal_slot: slot,
    recipe_id: recipeId,
    created_at: new Date().toISOString(),
  });

  const assignTo = async (date: string, slot: MealSlot, recipeId: string) => {
    // One recipe per slot: replace whatever was already there.
    const existing = (entries ?? []).filter(
      (e) => String(e.plan_date).slice(0, 10) === date && e.meal_slot === slot
    );
    await writeEntries([buildEntry(date, slot, recipeId)], existing);
  };

  const assignRecipe = async (recipe: Recipe) => {
    if (!picking || !user) return;
    const { date, slot } = picking;
    setPicking(null);
    await assignTo(date, slot, recipe.id);
  };

  // One tap, no dialog: takes the top-ranked pick for that slot.
  const surpriseMe = async (date: string, slot: MealSlot) => {
    if (!user || !recipes) return;
    const [top] = rankRecipes(recipes, ctx, {
      slot,
      limit: 1,
      excludeIds: weekRecipeIds,
      seed: Date.now() % 100000,
    });
    if (!top) return showToast('No suggestions available.');
    await assignTo(date, slot, top.recipe.id);
    showToast(`Added ${top.recipe.title || 'a recipe'}.`);
  };

  const planWeek = async () => {
    setConfirmPlanWeek(false);
    if (!user || !recipes) return;

    const emptyDinners = Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)))
      .filter((date) => !(entries ?? []).some(
        (e) => String(e.plan_date).slice(0, 10) === date && e.meal_slot === 'dinner'
      ));

    if (emptyDinners.length === 0) return showToast('Every dinner this week is already planned.');

    const picks = pickVariedSequence(recipes, ctx, emptyDinners.length, {
      slot: 'dinner',
      excludeIds: weekRecipeIds,
      seed: Date.now() % 100000,
    });

    const newEntries = picks.map((pick, i) => buildEntry(emptyDinners[i], 'dinner', pick.recipe.id));
    if (newEntries.length === 0) return showToast('No suggestions available.');

    const ok = await writeEntries(newEntries, []);
    if (ok) showToast(`Planned ${newEntries.length} dinner${newEntries.length > 1 ? 's' : ''}.`);
  };

  const removeEntry = async (id: string) => {
    await db.meal_plan.delete(id);
    await supabase.from('meal_plan').delete().eq('id', id);
    setConfirmRemove(null);
  };

  if (!user) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <CalendarDays className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">{t('planner.signInTitle')}</h2>
        <p className="text-slate-500 mt-2">{t('planner.signInBody')}</p>
      </div>
    );
  }

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${addDays(
    weekStart, 6
  ).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="min-h-full bg-slate-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center gap-4 mb-2">
          <CalendarDays className="w-10 h-10 text-orange-600" />
          <h1 className="text-4xl font-bold text-slate-900">Meal Planner</h1>
        </div>
        <p className="text-slate-600 mb-8">Plan the week's meals. Everyone in the family sees the same plan.</p>

        {/* Week navigation */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              title="Previous week"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-orange-600 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              title="Next week"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-orange-600 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="font-semibold text-slate-800 ml-2">{weekLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="text-sm bg-white border border-slate-200 px-4 py-2 min-h-[44px] rounded-lg text-slate-600 font-semibold hover:bg-slate-100 transition-colors"
            >
              This week
            </button>
            {/* Hands the visible week's recipes to the grocery aggregator. */}
            {weekRecipeIds.size > 0 && (
              <button
                onClick={() => navigate(`/shopping?ids=${Array.from(weekRecipeIds).join(',')}`)}
                className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 min-h-[44px] rounded-lg font-semibold hover:bg-green-700 active:scale-95 transition-all"
              >
                <ShoppingCart className="w-4 h-4" /> Shopping list
              </button>
            )}
            <button
              onClick={() => setConfirmPlanWeek(true)}
              className="flex items-center gap-2 text-sm bg-orange-600 text-white px-4 py-2 min-h-[44px] rounded-lg font-semibold hover:bg-orange-700 transition-colors"
            >
              <Wand2 className="w-4 h-4" /> Plan my week
            </button>
          </div>
        </div>

        {/* Slot headers -- desktop only; each mobile day card labels its own slots */}
        <div className="hidden lg:grid grid-cols-[9rem_repeat(4,1fr)] gap-3 mb-2 px-1">
          <div />
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {SLOT_LABELS[slot]}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {days.map((day) => {
            const iso = toISODate(day);
            const isToday = iso === todayISO;
            const dayPlan = planned.get(iso) ?? {};

            return (
              <div
                key={iso}
                className={`grid grid-cols-1 lg:grid-cols-[9rem_repeat(4,1fr)] gap-3 p-3 rounded-xl border ${
                  isToday ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex lg:flex-col lg:justify-center items-baseline lg:items-start gap-2">
                  <span className={`font-bold ${isToday ? 'text-orange-700' : 'text-slate-800'}`}>
                    {day.toLocaleDateString(undefined, { weekday: 'long' })}
                  </span>
                  <span className="text-sm text-slate-500">
                    {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {isToday && <span className="ml-2 text-orange-600 font-semibold">Today</span>}
                  </span>
                </div>

                {MEAL_SLOTS.map((slot) => {
                  const cell = dayPlan[slot];
                  return (
                    <div key={slot} className="min-w-0">
                      {/* Mobile-only slot label */}
                      <div className="lg:hidden text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {SLOT_LABELS[slot]}
                      </div>

                      {cell ? (
                        <div className="group relative bg-slate-50 border border-slate-200 rounded-lg p-3 h-full">
                          {cell.recipe ? (
                            <Link
                              to={`/recipes/${cell.recipe.id}`}
                              className="block pr-5 group/link"
                            >
                              <span className="block text-sm font-semibold text-slate-800 group-hover/link:text-orange-600 transition-colors line-clamp-2">
                                {cell.recipe.title || 'Untitled Recipe'}
                              </span>
                              {/* Enough at a glance to judge the week without opening anything. */}
                              <span className="block text-xs text-slate-500 mt-1 line-clamp-1">
                                {cell.recipe.dish_type || 'Recipe'} · {cell.recipe.complexity || 'Family recipe'}
                              </span>
                            </Link>
                          ) : (
                            // Planned by someone else against a recipe this
                            // user can't see (hidden, or a personal draft).
                            <span className="block text-sm text-slate-400 italic pr-5">Recipe unavailable</span>
                          )}
                          <button
                            onClick={() =>
                              setConfirmRemove({ id: cell.id, title: cell.recipe?.title || 'this meal' })
                            }
                            title="Remove from plan"
                            className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[3.5rem] border border-dashed border-slate-300 rounded-lg overflow-hidden divide-x divide-dashed divide-slate-300">
                          <button
                            onClick={() => { setPickerSeed((s) => s + 1); setPicking({ date: iso, slot }); }}
                            className="flex-1 flex items-center justify-center gap-1 text-slate-400 text-sm hover:text-orange-600 hover:bg-orange-50/50 transition-colors"
                          >
                            <Plus className="w-4 h-4" /> Add
                          </button>
                          {/* Fills instantly with the top pick -- the no-decision path. */}
                          <button
                            onClick={() => surpriseMe(iso, slot)}
                            title="Surprise me"
                            className="px-3 flex items-center justify-center text-slate-300 hover:text-orange-600 hover:bg-orange-50/50 transition-colors"
                          >
                            <Shuffle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <RecipePickerDialog
        open={!!picking}
        title={
          picking
            ? `Pick a recipe for ${SLOT_LABELS[picking.slot]} on ${new Date(
                `${picking.date}T00:00:00`
              ).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`
            : ''
        }
        suggestions={suggestions}
        allRecipes={recipes ?? []}
        onPick={assignRecipe}
        onReshuffle={() => setPickerSeed((s) => s + 1)}
        onCancel={() => setPicking(null)}
      />

      <ConfirmDialog
        open={confirmPlanWeek}
        title="Plan My Week"
        message="Fill every empty dinner this week with a varied set of suggestions? Meals you've already planned stay untouched."
        confirmLabel="Plan it"
        onConfirm={planWeek}
        onCancel={() => setConfirmPlanWeek(false)}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove from Plan"
        message={`Remove ${confirmRemove?.title} from the meal plan?`}
        confirmLabel="Remove"
        danger
        onConfirm={() => confirmRemove && removeEntry(confirmRemove.id)}
        onCancel={() => setConfirmRemove(null)}
      />

      <Toast message={toast} />
    </div>
  );
}
