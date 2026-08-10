import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ArrowLeft, Clock, ChefHat, Heart, EyeOff, Eye, Trash2, Globe, Edit3 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // 1. DATA FETCHING: Load the recipe and check if it is favorited or hidden by the current user.
  const recipe = useLiveQuery(() => db.recipes.get(id as string), [id]);
  
  const favorite = useLiveQuery(
    () => (user && id) ? db.favorites.where({ recipe_id: id, user_id: user.id }).first() : undefined,
    [id, user]
  );

  const hiddenRecord = useLiveQuery(
    () => (user && id) ? db.user_hidden_recipes.where({ user_id: user.id, recipe_id: id }).first() : undefined,
    [user, id]
  );

  // 2. ACTION HANDLERS: The logic executed when a user clicks a button.
  const toggleFavorite = async () => {
    if (!user || !id) return alert('Please sign in to favorite recipes!');
    if (favorite) {
      await db.favorites.delete(favorite.id);
      await supabase.from('favorites').delete().eq('id', favorite.id);
    } else {
      const newFav = { id: uuidv4(), recipe_id: id, user_id: user.id, created_at: new Date().toISOString() };
      await db.favorites.put(newFav);
      await supabase.from('favorites').insert(newFav);
    }
  };

  const handleHide = async () => {
    if (!user || !id) return;
    if (window.confirm("Hide this recipe from your personal vault? It will still be available to others.")) {
      const hiddenRecordData = { id: uuidv4(), user_id: user.id, recipe_id: id, created_at: new Date().toISOString() };
      await db.user_hidden_recipes.put(hiddenRecordData); // Updates local instantly
      await supabase.from('user_hidden_recipes').insert(hiddenRecordData); // Syncs to cloud
    }
  };

  const handleUnhide = async () => {
    if (!hiddenRecord) return;
    await db.user_hidden_recipes.delete(hiddenRecord.id);
    await supabase.from('user_hidden_recipes').delete().eq('id', hiddenRecord.id);
  };

  const handleDelete = async () => {
    if (!user || !id) return;
    if (window.confirm("Move this personal recipe to the Trash Bin?")) {
      const now = new Date().toISOString();
      await db.recipes.update(id, { deleted_at: now });
      await supabase.from('recipes').update({ deleted_at: now }).eq('id', id);
      navigate('/recipes');
    }
  };

  const handleSubmitGlobal = async () => {
    if (!user || !id) return;
    if (window.confirm("Submit this recipe for approval to join the global family vault?")) {
      // Update the recipe status so it shows as pending in the UI
      await db.recipes.update(id, { visibility: 'pending_global' });
      await supabase.from('recipes').update({ visibility: 'pending_global' }).eq('id', id);
      
      // Create the approval ticket for the admin
      const request = {
        id: uuidv4(),
        recipe_id: id,
        requested_by: user.id,
        request_type: 'promote_to_global' as const,
        status: 'pending' as const,
        created_at: new Date().toISOString()
      };
      await db.approval_requests.put(request);
      await supabase.from('approval_requests').insert(request);
      
      alert("Sent for admin approval!");
    }
  };

  const handleRequestEdit = async () => {
    if (!user || !id || !recipe) return;
    
    // The Input: We use a prompt to gather what they want changed.
    const newTitle = prompt("Suggest a new title or describe the edits you want for this global recipe:", recipe.title);
    if (!newTitle) return; // User cancelled

    const request = {
      id: uuidv4(),
      recipe_id: id,
      requested_by: user.id,
      request_type: 'edit_global' as const,
      proposed_changes: { title: newTitle }, // Packaging the input into the JSON column
      status: 'pending' as const,
      created_at: new Date().toISOString()
    };
    await db.approval_requests.put(request);
    await supabase.from('approval_requests').insert(request);
    alert("Edit request submitted to admin!");
  };

  const handleRequestDelete = async () => {
    if (!user || !id) return;
    if (window.confirm("Send a request to the admin to permanently delete this global recipe?")) {
      const request = {
        id: uuidv4(),
        recipe_id: id,
        requested_by: user.id,
        request_type: 'delete_global' as const,
        proposed_changes: {},
        status: 'pending' as const,
        created_at: new Date().toISOString()
      };
      await db.approval_requests.put(request);
      await supabase.from('approval_requests').insert(request);
      alert("Deletion request submitted to admin!");
    }
  };

  // 3. UI RENDERING: Loading states and safety checks
  if (recipe === undefined) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (recipe === null || recipe.deleted_at) return <div className="min-h-screen flex items-center justify-center">Recipe not found or deleted.</div>;

  // Evaluate permissions based on Schema V3 rules
  const isGlobal = recipe.visibility === 'global';
  const isOwner = recipe.owner_id === user?.id;
  const isPersonal = recipe.visibility === 'personal' || !recipe.visibility;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* 4. DYNAMIC UI: Hidden Banner Notice */}
      {hiddenRecord && (
        <div className="bg-amber-500 text-white px-4 py-3 text-center flex items-center justify-center gap-4 shadow-md sticky top-0 z-50">
          <span>This recipe is currently hidden from your vault.</span>
          <button 
            onClick={handleUnhide}
            className="bg-white text-amber-900 px-3 py-1 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors flex items-center gap-1">
            <Eye className="w-4 h-4" /> Unhide Recipe
          </button>
        </div>
      )}

      <div className="h-64 bg-slate-800 w-full flex items-center justify-center relative">
        <Link to="/recipes" className="absolute top-6 left-6 text-white hover:text-orange-400 flex items-center gap-2 bg-black/30 px-4 py-2 rounded-lg backdrop-blur-sm transition-colors">
          <ArrowLeft className="w-5 h-5" /> Back
        </Link>
        <ChefHat className="w-20 h-20 text-slate-600 opacity-50" />
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-12 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border border-slate-100">
          
          <div className="flex justify-between items-start mb-4">
            <div className="flex gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                {recipe.dish_type}
              </span>
              {/* White Screen of Death Fix applied here */}
              {!isGlobal && (
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                  {(recipe.visibility || 'personal').replace('_', ' ')}
                </span>
              )}
            </div>
            
            {/* 5. DYNAMIC UI: Action Buttons based on state and ownership */}
            <div className="flex items-center gap-2">
              
              {/* Global Recipe Tools: Hide, Edit Request, Delete Request */}
              {isGlobal && (
                <>
                  {!hiddenRecord && (
                    <button onClick={handleHide} title="Hide this recipe" className="p-3 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all">
                      <EyeOff className="w-5 h-5" />
                    </button>
                  )}
                  <button onClick={handleRequestEdit} title="Request Edit" className="p-3 rounded-full text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all">
                    <Edit3 className="w-5 h-5" />
                  </button>
                  <button onClick={handleRequestDelete} title="Request Deletion" className="p-3 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-all">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Personal Recipe Tools: Promote to Global, Move to Trash */}
              {isOwner && isPersonal && (
                <>
                  <button onClick={handleSubmitGlobal} title="Submit to Global Vault" className="p-3 rounded-full text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all">
                    <Globe className="w-5 h-5" />
                  </button>
                  <button onClick={handleDelete} title="Move to Trash" className="p-3 rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-all">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Universal Tool: Favorite Button */}
              <button onClick={toggleFavorite} className={`p-3 rounded-full transition-all ${favorite ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                <Heart className={`w-6 h-6 ${favorite ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">{recipe.title}</h1>
          
          <div className="flex flex-wrap items-center text-slate-600 gap-6 mb-10 pb-10 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-600" />
              <span>Total: {recipe.total_time_min}m</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-1">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Ingredients</h2>
              <ul className="space-y-3 text-slate-700">
                {Array.isArray(recipe.ingredients) ? recipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2"><span className="text-orange-500 mt-1">•</span><span>{typeof ing === 'string' ? ing : JSON.stringify(ing)}</span></li>
                  )) : <p>{String(recipe.ingredients)}</p>}
              </ul>
            </div>
            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Instructions</h2>
              <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                {recipe.instructions || "No instructions provided for this recipe."}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}