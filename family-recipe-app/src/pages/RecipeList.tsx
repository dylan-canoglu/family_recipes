import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { getVisibleRecipes } from '../lib/recipes';
import { syncRecipes } from '../lib/sync';
import { useAuth } from '../lib/AuthContext';
import { ChefHat, Clock, Search } from 'lucide-react';

export function RecipeList() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDishType, setFilterDishType] = useState('');
  const [filterComplexity, setFilterComplexity] = useState('');

  // 1. Query the LOCAL database safely
  const recipes = useLiveQuery(async () => {
    try {
      // Trash / hidden / ownership rules live in getVisibleRecipes so every
      // screen applies them identically; only the search filters are local.
      const visibleRecipes = await getVisibleRecipes(user?.id);

      return visibleRecipes.filter(recipe => {
        // Safe User Filters (using fallbacks so it never crashes on undefined)
        const safeTitle = recipe.title || '';
        const matchesSearch = safeTitle.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDish = filterDishType ? recipe.dish_type === filterDishType : true;
        const matchesComplexity = filterComplexity ? recipe.complexity === filterComplexity : true;
        
        return matchesSearch && matchesDish && matchesComplexity;
      });
    } catch (err) {
      console.error("Dexie query failed:", err);
      return []; // Return empty array instead of crashing
    }
  }, [searchTerm, filterDishType, filterComplexity, user]); 

  useEffect(() => {
    syncRecipes();
  }, []);

  if (!recipes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-xl text-slate-600 animate-pulse">Unlocking the vault...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <ChefHat className="w-10 h-10 text-orange-600" />
          <h1 className="text-4xl font-bold text-slate-900">The Vault</h1>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search recipes..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="border border-slate-200 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={filterDishType}
            onChange={(e) => setFilterDishType(e.target.value)}
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
            className="border border-slate-200 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {recipes.map((recipe) => (
            <Link 
              to={`/recipes/${recipe.id}`}
              key={recipe.id} 
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all block group relative"
            >
              {recipe.visibility === 'personal' && (
                <div className="absolute top-3 left-3 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded shadow-sm z-10">
                  DRAFT
                </div>
              )}

              <div className="h-48 bg-slate-100 w-full flex items-center justify-center border-b border-slate-100 group-hover:bg-orange-50 transition-colors">
                <ChefHat className="w-8 h-8 text-slate-300 group-hover:text-orange-200 transition-colors" />
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
                
                <div className="flex items-center text-sm text-slate-500 gap-4 mt-4">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{recipe.total_time_min || 0}m</span>
                  </div>
                  {recipe.cuisine && (
                    <span className="truncate">• {recipe.cuisine}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        {recipes.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            No recipes match your current filters.
          </div>
        )}
      </div>
    </div>
  );
}