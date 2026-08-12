import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, type Recipe, type RecipeStat } from '../lib/db';
import { getVisibleRecipes } from '../lib/recipes';
import { syncRecipeStats } from '../lib/sync';
import { useAuth } from '../lib/AuthContext';
import { useT } from '../lib/i18n';
import { StarRating } from '../components/StarRating';
import { Compass, Flame, Sparkles, Clock, History, Shuffle, CookingPot, ChefHat } from 'lucide-react';

// How many recipes each panel shows before it stops.
const PANEL_SIZE = 6;
// A recipe nobody has made in this long is a candidate for a revival.
const STALE_AFTER_DAYS = 180;

interface Pick {
  recipe: Recipe;
  stat?: RecipeStat;
}

const daysSince = (isoDate: string | null) => {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / 86_400_000;
};

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// Fisher-Yates, so the "never cooked" panel surfaces a different corner of the
// 200-recipe vault each time rather than always the same alphabetical head.
function sample<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function PickCard({ recipe, badge }: { recipe: Recipe; badge: React.ReactNode }) {
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-1 transition-all block group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-1 rounded">
          {recipe.dish_type || 'Uncategorized'}
        </span>
        <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
          <Clock className="w-3 h-3" /> {recipe.total_time_min || 0}m
        </span>
      </div>
      <h3 className="font-bold text-slate-900 mb-3 line-clamp-2 group-hover:text-orange-600 transition-colors">
        {recipe.title || 'Untitled Recipe'}
      </h3>
      <div className="text-sm text-slate-500">{badge}</div>
    </Link>
  );
}

function Panel({
  title, description, icon: Icon, accent, picks, badge, action,
}: {
  title: string;
  description: string;
  icon: typeof Flame;
  accent: string;
  picks: Pick[];
  badge: (pick: Pick) => React.ReactNode;
  action?: React.ReactNode;
}) {
  if (picks.length === 0) return null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Icon className={`w-6 h-6 ${accent}`} /> {title}
        </h2>
        {action}
      </div>
      <p className="text-slate-600 mb-5">{description}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {picks.map((pick) => (
          <PickCard key={pick.recipe.id} recipe={pick.recipe} badge={badge(pick)} />
        ))}
      </div>
    </section>
  );
}

export function Discovery() {
  const { user } = useAuth();
  const t = useT();
  const [shuffleKey, setShuffleKey] = useState(0);

  // Family-wide aggregates are cached locally, but refresh them on mount so
  // the numbers reflect what everyone else has cooked since the last visit.
  useEffect(() => {
    if (user) syncRecipeStats();
  }, [user]);

  const recipes = useLiveQuery(() => getVisibleRecipes(user?.id), [user]);
  const stats = useLiveQuery(() => db.recipe_stats.toArray(), []);
  const myLogs = useLiveQuery(
    () => user ? db.cooking_logs.where({ user_id: user.id }).toArray() : [],
    [user]
  );

  // Memoised so the sample only changes when the data does or the user asks
  // for a reshuffle -- otherwise every unrelated re-render would swap the
  // cards out from under them.
  const neverCooked = useMemo<Pick[]>(() => {
    if (!recipes || !stats) return [];
    const byRecipe = new Map(stats.map((s) => [s.recipe_id, s]));
    const candidates = recipes.filter((r) => (byRecipe.get(r.id)?.cook_count ?? 0) === 0);
    return sample(candidates, PANEL_SIZE).map((recipe) => ({ recipe }));
  }, [recipes, stats, shuffleKey]);

  if (!user) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <Compass className="w-12 h-12 text-slate-300 mb-4" />
        {/* Not "sign in to explore the vault" -- guests can browse every
            recipe. What needs an account is the cooking history this page
            is built from. */}
        <h2 className="text-2xl font-bold text-slate-900">{t('discovery.signIn')}</h2>
        <p className="text-slate-500 mt-2">
          {t('discovery.signInBody')}
        </p>
      </div>
    );
  }

  if (!recipes || !stats || !myLogs) {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50">
        <p className="text-xl text-slate-600 animate-pulse">Reading the family's cooking history...</p>
      </div>
    );
  }

  const statsByRecipe = new Map(stats.map((s) => [s.recipe_id, s]));
  const withStats: Pick[] = recipes.map((recipe) => ({ recipe, stat: statsByRecipe.get(recipe.id) }));

  // --- Panel 1: what the family reaches for most often.
  const mostCooked = withStats
    .filter((p) => (p.stat?.cook_count ?? 0) > 0)
    .sort((a, b) => (b.stat!.cook_count - a.stat!.cook_count))
    .slice(0, PANEL_SIZE);

  // --- Panel 2: the family loves it, this user has never made it.
  const lovedButUntried = withStats
    .filter((p) => p.stat && p.stat.rating_count > 0 && (p.stat.avg_rating ?? 0) >= 4 && p.stat.cook_count_mine === 0)
    .sort((a, b) => (b.stat!.avg_rating ?? 0) - (a.stat!.avg_rating ?? 0))
    .slice(0, PANEL_SIZE);

  // --- Panel 3: cooked once upon a time, then forgotten.
  const dueForRevival = withStats
    .filter((p) => (p.stat?.cook_count ?? 0) > 0 && daysSince(p.stat!.last_cooked_at) >= STALE_AFTER_DAYS)
    .sort((a, b) => daysSince(b.stat!.last_cooked_at) - daysSince(a.stat!.last_cooked_at))
    .slice(0, PANEL_SIZE);

  // Panel 4 (never cooked by anyone) is sampled above, in a memo.

  // --- Panel 5: this user's own highest-rated cooks, from their private logs.
  const myRatings = new Map<string, { total: number; count: number }>();
  for (const log of myLogs) {
    if (log.rating <= 0) continue;
    const entry = myRatings.get(log.recipe_id) ?? { total: 0, count: 0 };
    entry.total += log.rating;
    entry.count += 1;
    myRatings.set(log.recipe_id, entry);
  }
  const myTopRated = withStats
    .filter((p) => myRatings.has(p.recipe.id))
    .map((p) => ({ ...p, myAverage: myRatings.get(p.recipe.id)!.total / myRatings.get(p.recipe.id)!.count }))
    .sort((a, b) => b.myAverage - a.myAverage)
    .slice(0, PANEL_SIZE);

  const myCookCount = myLogs.length;
  const myRecipeCount = new Set(myLogs.map((l) => l.recipe_id)).size;
  const familyCookCount = stats.reduce((sum, s) => sum + s.cook_count, 0);
  const hasAnyActivity = familyCookCount > 0;

  return (
    <div className="min-h-full bg-slate-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-12">

        <div>
          <div className="flex items-center gap-4 mb-2">
            <Compass className="w-10 h-10 text-orange-600" />
            <h1 className="text-4xl font-bold text-slate-900">Discovery</h1>
          </div>
          <p className="text-slate-600">What the family cooks, what it loves, and what's still waiting to be tried.</p>
        </div>

        {/* Activity summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Cooks you’ve logged', value: myCookCount },
            { label: 'Recipes you’ve tried', value: myRecipeCount },
            { label: 'Cooks across the family', value: familyCookCount },
            { label: 'Recipes in your vault', value: recipes.length },
          ].map((tile) => (
            <div key={tile.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-3xl font-bold text-slate-900">{tile.value}</div>
              <div className="text-sm text-slate-500 mt-1">{tile.label}</div>
            </div>
          ))}
        </div>

        {!hasAnyActivity && (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-8 text-center">
            <CookingPot className="w-10 h-10 text-orange-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-900 mb-1">No cooks logged yet</h2>
            <p className="text-slate-600">
              Open any recipe and use <span className="font-semibold">Log a Cook</span> to record what you made and how it
              turned out. Once a few cooks are in, this page fills up with the family's favourites.
            </p>
          </div>
        )}

        <Panel
          title="Most Cooked"
          description="The dishes this family comes back to again and again."
          icon={Flame}
          accent="text-red-500"
          picks={mostCooked}
          badge={({ stat }) => (
            <span className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">
                Cooked {stat!.cook_count}&times;
              </span>
              {stat!.avg_rating != null && (
                <>
                  <span className="text-slate-300">|</span>
                  <StarRating value={Math.round(stat!.avg_rating)} size="sm" />
                </>
              )}
            </span>
          )}
        />

        <Panel
          title="Loved, But Not By You Yet"
          description="Highly rated by the family — and you haven't cooked them once."
          icon={Sparkles}
          accent="text-amber-500"
          picks={lovedButUntried}
          badge={({ stat }) => (
            <span className="flex items-center gap-2">
              <StarRating value={Math.round(stat!.avg_rating ?? 0)} size="sm" />
              <span>{stat!.avg_rating!.toFixed(1)} from {stat!.rating_count} cook{stat!.rating_count > 1 ? 's' : ''}</span>
            </span>
          )}
        />

        <Panel
          title="Your Favourites"
          description="The recipes you personally rated highest."
          icon={CookingPot}
          accent="text-orange-500"
          picks={myTopRated}
          badge={(pick) => {
            const rating = myRatings.get(pick.recipe.id)!;
            return (
              <span className="flex items-center gap-2">
                <StarRating value={Math.round(rating.total / rating.count)} size="sm" />
                <span>you cooked it {rating.count}&times;</span>
              </span>
            );
          }}
        />

        <Panel
          title="Due for a Revival"
          description={`Nobody has made these in over ${Math.round(STALE_AFTER_DAYS / 30)} months.`}
          icon={History}
          accent="text-blue-500"
          picks={dueForRevival}
          badge={({ stat }) => <span>Last cooked {formatDate(stat!.last_cooked_at!)}</span>}
        />

        <Panel
          title="Never Cooked"
          description="Corners of the vault nobody has opened yet. Someone has to be first."
          icon={ChefHat}
          accent="text-slate-400"
          picks={neverCooked}
          action={
            <button
              onClick={() => setShuffleKey((k) => k + 1)}
              className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-4 py-2 rounded-lg text-slate-600 font-semibold hover:bg-slate-100 transition-colors"
            >
              <Shuffle className="w-4 h-4" /> Show me others
            </button>
          }
          badge={() => <span className="text-slate-400">Waiting for its first cook</span>}
        />

      </div>
    </div>
  );
}
