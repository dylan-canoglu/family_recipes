import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../lib/db';
import { useAuth } from '../lib/AuthContext';
import { ChefHat, Clock, Heart, HeartCrack, LogIn } from 'lucide-react';

export function Favorites() {
  const { user } = useAuth();

  // Query Dexie for the user's favorites, then fetch the corresponding recipes
  const favoriteRecipes = useLiveQuery(async () => {
    if (!user) return null; // Not logged in
    
    // 1. Get all favorite records for this user
    const userFavorites = await db.favorites.where({ user_id: user.id }).toArray();
    
    // 2. Extract just the recipe IDs
    const recipeIds = userFavorites.map(fav => fav.recipe_id);
    
    // 3. Fetch the full recipe objects that match those IDs
    return await db.recipes.where('id').anyOf(recipeIds).toArray();
  }, [user]); // Re-run if the user changes

  // State: Not Logged In
  if (!user) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-orange-50 p-6 rounded-full mb-6">
          <Heart className="w-12 h-12 text-orange-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Save Your Favorites</h2>
        <p className="text-slate-500 mb-8 max-w-md">
          Sign in to curate your personal collection of family recipes for quick access.
        </p>
        <Link 
          to="/auth" 
          className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 transition-colors shadow-sm"
        >
          <LogIn className="w-5 h-5" /> Sign In to the Vault
        </Link>
      </div>
    );
  }

  // State: Loading
  if (favoriteRecipes === undefined) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-xl text-slate-400 animate-pulse">Loading your favorites...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex items-center gap-4 mb-2">
          <Heart className="w-10 h-10 text-rose-500 fill-current" />
          <h1 className="text-4xl font-bold text-slate-900">Your Favorites</h1>
        </div>
        <p className="text-slate-500 mb-10 font-medium">
          {favoriteRecipes.length} curated {favoriteRecipes.length === 1 ? 'recipe' : 'recipes'}
        </p>

        {/* State: Empty Favorites */}
        {favoriteRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
            <HeartCrack className="w-16 h-16 text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">No favorites yet!</h3>
            <p className="text-slate-500 max-w-sm mb-6">
              Browse the vault and click the heart icon on any recipe you want to save here for quick access.
            </p>
            <Link 
              to="/recipes"
              className="text-orange-600 font-semibold hover:text-orange-700 hover:underline"
            >
              Explore the Vault &rarr;
            </Link>
          </div>
        ) : (
          /* Recipe Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {favoriteRecipes.map((recipe) => (
              <Link 
                to={`/recipes/${recipe.id}`}
                key={recipe.id} 
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all block group relative"
              >
                {/* Floating Heart Icon indicating it's favorited */}
                <div className="absolute top-3 right-3 bg-white/90 p-2 rounded-full shadow-sm z-10 text-rose-500 backdrop-blur-sm">
                  <Heart className="w-4 h-4 fill-current" />
                </div>

                <div className="h-48 bg-slate-100 w-full flex items-center justify-center border-b border-slate-100 group-hover:bg-orange-50 transition-colors">
                  <ChefHat className="w-8 h-8 text-slate-300 group-hover:text-orange-200 transition-colors" />
                </div>
                
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-1 rounded">
                      {recipe.dish_type}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      recipe.complexity === 'Easy' ? 'bg-green-100 text-green-700' : 
                      recipe.complexity === 'Medium' ? 'bg-amber-100 text-amber-700' : 
                      'bg-red-100 text-red-700'
                    }`}>
                      {recipe.complexity}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-orange-600 transition-colors">
                    {recipe.title}
                  </h3>
                  
                  <div className="flex items-center text-sm text-slate-500 gap-4 mt-4">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{recipe.total_time_min}m</span>
                    </div>
                    {recipe.cuisine && (
                      <span className="truncate">• {recipe.cuisine}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}