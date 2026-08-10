import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Recipe } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Trash2, Eye, RefreshCw, ChefHat, EyeOff, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';

interface DialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function Dashboard() {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const trashedRecipes = useLiveQuery(async () => {
    if (!user) return [];
    const all = await db.recipes.toArray();
    return all.filter(r => r.deleted_at != null && r.owner_id === user.id);
  }, [user]);

  const hiddenRecipes = useLiveQuery(async () => {
    if (!user) return [];
    const hiddenRecords = await db.user_hidden_recipes.where({ user_id: user.id }).toArray();
    const ids = hiddenRecords.map(h => h.recipe_id);
    return await db.recipes.where('id').anyOf(ids).toArray();
  }, [user]);

  const restoreTrash = async (id: string) => {
    await db.recipes.update(id, { deleted_at: null });
    await supabase.from('recipes').update({ deleted_at: null }).eq('id', id);
  };

  const handlePermanentDelete = async (recipe: Recipe) => {
    if (!user) return;
    const favorite = await db.favorites.where({ recipe_id: recipe.id, user_id: user.id }).first();

    setDialog({
      title: 'Delete Forever',
      message: favorite
        ? `"${recipe.title || 'This recipe'}" is in your Favorites. Permanently deleting it will also remove it from your Favorites. This cannot be undone.`
        : `Permanently delete "${recipe.title || 'this recipe'}"? This cannot be undone.`,
      confirmLabel: 'Delete Forever',
      danger: true,
      onConfirm: async () => {
        try {
          if (favorite) {
            await db.favorites.delete(favorite.id);
            await supabase.from('favorites').delete().eq('id', favorite.id);
          }

          await db.recipes.delete(recipe.id);
          const { error } = await supabase.from('recipes').delete().eq('id', recipe.id);
          if (error) {
            console.error('Failed to delete from cloud:', error);
            showToast('Could not connect to the cloud to delete. Try again later.');
          }
        } catch (err) {
          console.error(err);
        }
        setDialog(null);
      },
    });
  };

  const unhideRecipe = async (recipeId: string) => {
    if (!user) return;
    const record = await db.user_hidden_recipes.where({ recipe_id: recipeId, user_id: user.id }).first();
    if (record) {
      await db.user_hidden_recipes.delete(record.id);
      await supabase.from('user_hidden_recipes').delete().eq('id', record.id);
    }
  };

  if (!user) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <ChefHat className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Sign in to view your Dashboard</h2>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-12 bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-12">

        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Vault Management</h1>
          <p className="text-slate-600">Manage your hidden content and recover or permanently delete recipes.</p>
        </div>

        {/* HIDDEN RECIPES SECTION */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 p-4 border-b border-slate-200 flex items-center gap-3">
            <EyeOff className="w-6 h-6 text-slate-600" />
            <h2 className="text-xl font-bold text-slate-800">Hidden Recipes</h2>
          </div>
          <div className="p-6">
            {!hiddenRecipes || hiddenRecipes.length === 0 ? (
              <p className="text-slate-500 text-center py-6">You have no hidden recipes.</p>
            ) : (
              <ul className="space-y-4">
                {hiddenRecipes.map(recipe => (
                  <li key={recipe.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="font-semibold text-slate-700">{recipe.title || 'Untitled'}</span>
                    <button
                      onClick={() => unhideRecipe(recipe.id)}
                      className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-100 hover:text-blue-600 transition-colors"
                    >
                      <Eye className="w-4 h-4" /> Unhide
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* TRASH BIN SECTION */}
        <section className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
          <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-red-500" />
            <h2 className="text-xl font-bold text-red-800">Trash Bin</h2>
          </div>
          <div className="p-6">
            {!trashedRecipes || trashedRecipes.length === 0 ? (
              <p className="text-slate-500 text-center py-6">Your trash bin is empty.</p>
            ) : (
              <ul className="space-y-4">
                {trashedRecipes.map(recipe => (
                  <li key={recipe.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-red-50/50 rounded-xl border border-red-100">
                    <div>
                      <span className="font-semibold text-slate-700 block">{recipe.title || 'Untitled'}</span>
                      <span className="text-xs text-slate-500">Deleted: {new Date(recipe.deleted_at as string).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => restoreTrash(recipe.id)}
                        className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-4 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" /> Restore
                      </button>

                      <button
                        onClick={() => handlePermanentDelete(recipe)}
                        className="flex items-center gap-2 text-sm bg-red-100 border border-red-200 px-4 py-2 rounded-lg text-red-700 hover:bg-red-600 hover:text-white transition-colors"
                      >
                        <AlertTriangle className="w-4 h-4" /> Delete Forever
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </div>

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
