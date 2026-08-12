import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { db, type Recipe } from '../lib/db';
import { supabase } from '../lib/supabase';
import { getVisibleRecipes } from '../lib/recipes';
import { syncMealPlan, syncRecipeStats, syncRecipes } from '../lib/sync';
import { buildStatsMap, rankRecipes, type RankContext } from '../lib/suggest';
import { useAuth } from '../lib/AuthContext';
import { HOUSEHOLD_ID, MEAL_SLOTS, type MealSlot } from '../lib/constants';
import { Toast } from '../components/Toast';
import { ChefHat, CookingPot, Shuffle, CalendarPlus, ChevronRight, Heart, RotateCcw } from 'lucide-react';

const LANE_SIZE = 8;

// The front door for anyone who is neither signed in nor already touring.
// Without this a first-time visitor lands on an empty vault, since nothing
// syncs until someone has actually chosen how they want to browse.
function Welcome({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="bg-orange-50 p-5 rounded-full mb-6">
        <ChefHat className="w-12 h-12 text-orange-500" />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 mb-3">The Family Recipe Vault</h1>
      <p className="text-slate-500 max-w-md mb-8">
        Two hundred handwritten family recipes, scanned and searchable — with a meal planner,
        a shopping list that merges everything, and a cook mode for the kitchen counter.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <Link
          to="/auth"
          className="flex-1 flex items-center justify-center min-h-[44px] px-6 rounded-xl bg-orange-600 text-white font-semibold shadow-sm hover:bg-orange-700 active:scale-[0.98] transition-all"
        >
          Sign In
        </Link>
        <button
          onClick={onExplore}
          className="flex-1 flex items-center justify-center min-h-[44px] px-6 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          Explore as guest
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-4 max-w-sm">
        Guests get the whole vault read-only — nothing is saved, and the family's
        favorites, notes and meal plan stay private.
      </p>
    </div>
  );
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Seeding from the date rather than 0 gives a different opening suggestion each
// day, while staying stable within the day -- navigating away and back does not
// reshuffle the pick out from under you.
const seedForToday = () => {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
};

function LaneCard({ recipe, subtitle }: { recipe: Recipe; subtitle?: string }) {
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="snap-start flex-shrink-0 w-56 bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all group"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-1 rounded">
        {recipe.dish_type || 'Recipe'}
      </span>
      <h3 className="font-bold text-slate-900 mt-3 line-clamp-2 group-hover:text-orange-600 transition-colors">
        {recipe.title || 'Untitled Recipe'}
      </h3>
      <p className="text-xs text-slate-500 mt-2 line-clamp-1">
        {subtitle ?? `${recipe.complexity || 'Family'} · ${recipe.cuisine || 'Family recipe'}`}
      </p>
    </Link>
  );
}

function Lane({
  title, recipes, icon: Icon, to, subtitleFor,
}: {
  title: string;
  recipes: Recipe[];
  icon?: typeof Heart;
  to?: string;
  subtitleFor?: (recipe: Recipe) => string | undefined;
}) {
  if (recipes.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="font-bold text-slate-900 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-orange-500" />} {title}
        </h2>
        {to && (
          <Link to={to} className="text-sm text-orange-600 font-semibold hover:underline flex items-center">
            See all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      {/* Horizontal scroll rather than a grid: lanes stay one row tall, so more
          of them fit on a phone screen without scrolling the page. */}
      <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-1 px-1">
        {recipes.map((recipe) => (
          <LaneCard key={recipe.id} recipe={recipe} subtitle={subtitleFor?.(recipe)} />
        ))}
      </div>
    </section>
  );
}

export function Home() {
  const { user, isGuest, enterGuestMode } = useAuth();
  const navigate = useNavigate();
  const [shuffle, setShuffle] = useState(seedForToday);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Nothing is fetched until someone has chosen to sign in or tour as a
    // guest, so a bare visitor gets the welcome screen rather than a vault
    // that quietly populated itself.
    if (!user && !isGuest) return;
    syncRecipes();
    if (user) {
      syncRecipeStats();
      syncMealPlan();
    }
  }, [user, isGuest]);

  const recipes = useLiveQuery(() => getVisibleRecipes(user?.id), [user]);
  const stats = useLiveQuery(() => db.recipe_stats.toArray(), []);
  const favorites = useLiveQuery(
    () => (user ? db.favorites.where({ user_id: user.id }).toArray() : []),
    [user]
  );
  const myLogs = useLiveQuery(
    () => (user ? db.cooking_logs.where({ user_id: user.id }).toArray() : []),
    [user]
  );
  // Gated on `user`, not just on the sync: signing out does not clear Dexie,
  // so a guest on a family member's phone would otherwise read the household's
  // week straight out of the local cache.
  const planEntries = useLiveQuery(() => (user ? db.meal_plan.toArray() : []), [user]);

  const today = new Date();
  const todayISO = toISODate(today);

  const ctx: RankContext = useMemo(() => ({
    statsByRecipe: buildStatsMap(stats),
    favoriteIds: new Set((favorites ?? []).map((f) => f.recipe_id)),
  }), [stats, favorites]);

  const byId = useMemo(
    () => new Map((recipes ?? []).map((r) => [r.id, r])),
    [recipes]
  );

  // Anything already planned for today outranks a fresh suggestion -- the
  // decision has been made, so the app shouldn't ask again.
  const plannedToday = useMemo(() => {
    const forToday = (planEntries ?? []).filter((e) => String(e.plan_date).slice(0, 10) === todayISO);
    const order = (slot: string) => MEAL_SLOTS.indexOf(slot as MealSlot);
    return forToday
      .sort((a, b) => order(a.meal_slot) - order(b.meal_slot))
      .map((entry) => ({ entry, recipe: byId.get(entry.recipe_id) }))
      .filter((x): x is { entry: typeof forToday[number]; recipe: Recipe } => !!x.recipe);
  }, [planEntries, byId, todayISO]);

  const hasDinnerToday = plannedToday.some((p) => p.entry.meal_slot === 'dinner');

  const suggestion = useMemo(() => {
    if (!recipes) return undefined;
    return rankRecipes(recipes, ctx, { slot: 'any', limit: 1, excludeIds: skippedIds, seed: shuffle })[0];
  }, [recipes, ctx, skippedIds, shuffle]);

  const lanes = useMemo(() => {
    if (!recipes) return null;
    const lane = (dishType: string) =>
      rankRecipes(recipes, ctx, { dishTypes: [dishType], limit: LANE_SIZE, seed: shuffle })
        .map((s) => s.recipe);

    const favoriteRecipes = (favorites ?? [])
      .map((f) => byId.get(f.recipe_id))
      .filter((r): r is Recipe => !!r)
      .slice(0, LANE_SIZE);

    // Most recently cooked first, one card per recipe.
    const cookedAgain = [...(myLogs ?? [])]
      .sort((a, b) => String(b.cooked_at).localeCompare(String(a.cooked_at)))
      .map((log) => byId.get(log.recipe_id))
      .filter((r): r is Recipe => !!r)
      .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
      .slice(0, LANE_SIZE);

    return {
      mains: lane('Main Dish'),
      soups: lane('Soup'),
      desserts: lane('Dessert'),
      pastries: lane('Pastry'),
      favoriteRecipes,
      cookedAgain,
    };
  }, [recipes, ctx, favorites, myLogs, byId, shuffle]);

  const another = () => {
    if (suggestion) setSkippedIds((ids) => [...ids, suggestion.recipe.id]);
    setShuffle((s) => s + 1);
  };

  const addToTonight = async () => {
    if (!user || !suggestion) return;
    const entry = {
      id: uuidv4(),
      household_id: HOUSEHOLD_ID,
      plan_date: todayISO,
      meal_slot: 'dinner' as MealSlot,
      recipe_id: suggestion.recipe.id,
      created_at: new Date().toISOString(),
    };
    await db.meal_plan.put(entry);
    const { error } = await supabase.from('meal_plan').insert(entry);
    if (error) {
      console.error('Failed to push meal plan entry to cloud:', error);
      showToast('Added locally — it will need re-syncing.');
    } else {
      showToast('Added to tonight’s plan.');
    }
  };

  // Must precede the loading branch: with sync gated off for a bare visitor,
  // `recipes` never arrives and they would sit on "Warming up the kitchen".
  if (!user && !isGuest) return <Welcome onExplore={enterGuestMode} />;

  if (!recipes || !lanes) {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50">
        <p className="text-xl text-slate-600 animate-pulse">Warming up the kitchen...</p>
      </div>
    );
  }

  const heroPlanned = plannedToday[0];
  const heroRecipe = heroPlanned?.recipe ?? suggestion?.recipe;

  return (
    <div className="min-h-full bg-slate-50 p-5 md:p-12">
      <div className="max-w-5xl mx-auto space-y-10">

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-600">
            {today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
            {heroPlanned ? 'On the plan today' : 'What are we cooking?'}
          </h1>
        </div>

        {/* The one-tap path: a single decided recipe, no scrolling required. */}
        {heroRecipe ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                {heroPlanned ? SLOT_LABELS[heroPlanned.entry.meal_slot as MealSlot] : heroRecipe.dish_type || 'Recipe'}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {heroRecipe.complexity || 'Family recipe'}
              </span>
            </div>

            <h2 className="text-2xl md:text-4xl font-bold text-slate-900 leading-tight">
              {heroRecipe.title || 'Untitled Recipe'}
            </h2>
            <p className="text-slate-500 mt-2">
              {heroPlanned
                ? `${heroRecipe.dish_type || 'Recipe'} · planned for ${SLOT_LABELS[heroPlanned.entry.meal_slot as MealSlot].toLowerCase()}`
                : suggestion?.reason}
            </p>

            <div className="flex flex-wrap gap-3 mt-7">
              <button
                onClick={() => navigate(`/recipes/${heroRecipe.id}`)}
                className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-700 transition-colors shadow-sm"
              >
                <CookingPot className="w-5 h-5" /> Start cooking
              </button>

              {!heroPlanned && (
                <>
                  <button
                    onClick={another}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-3 rounded-xl font-semibold hover:bg-slate-100 transition-colors"
                  >
                    <Shuffle className="w-5 h-5" /> Another
                  </button>
                  {user && !hasDinnerToday && (
                    <button
                      onClick={addToTonight}
                      className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-3 rounded-xl font-semibold hover:bg-slate-100 transition-colors"
                    >
                      <CalendarPlus className="w-5 h-5" /> Add to tonight
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No recipes in the vault yet.</p>
          </div>
        )}

        {/* Everything else planned for today, after the headline meal. */}
        {plannedToday.length > 1 && (
          <Lane
            title="Also planned today"
            icon={CalendarPlus}
            to="/planner"
            recipes={plannedToday.slice(1).map((p) => p.recipe)}
            subtitleFor={(recipe) => {
              const slot = plannedToday.find((p) => p.recipe.id === recipe.id)?.entry.meal_slot;
              return slot ? SLOT_LABELS[slot as MealSlot] : undefined;
            }}
          />
        )}

        <Lane title="Your favourites" icon={Heart} to="/favorites" recipes={lanes.favoriteRecipes} />
        <Lane title="Cook it again" icon={RotateCcw} recipes={lanes.cookedAgain} />
        <Lane title="Main dishes" recipes={lanes.mains} to="/recipes?dish=Main+Dish" />
        <Lane title="Soups" recipes={lanes.soups} to="/recipes?dish=Soup" />
        <Lane title="Desserts" recipes={lanes.desserts} to="/recipes?dish=Dessert" />
        <Lane title="Pastries" recipes={lanes.pastries} to="/recipes?dish=Pastry" />

      </div>
      <Toast message={toast} />
    </div>
  );
}
