import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ArrowLeft, Clock, ChefHat, Heart, EyeOff, Eye, Trash2, Globe, Edit3, StickyNote, Save, Languages } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';
import { EditRecipeDialog, type EditRecipeFields } from '../components/EditRecipeDialog';
import { formatIngredientList, formatInstructionSteps } from '../lib/format';

interface DialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

const EMPTY_EDIT_FIELDS: EditRecipeFields = { title: '', ingredients: '', instructions: '', notes: '' };

export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFields, setEditFields] = useState<EditRecipeFields>(EMPTY_EDIT_FIELDS);

  const [noteDraft, setNoteDraft] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

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

  const myNote = useLiveQuery(
    () => (user && id) ? db.user_recipe_notes.where({ user_id: user.id, recipe_id: id }).first() : undefined,
    [user, id]
  );

  // Populate the notes textarea once the existing note (if any) has loaded.
  useEffect(() => {
    if (myNote) setNoteDraft(myNote.note_text);
  }, [myNote]);

  // Default back to English whenever a different recipe is opened.
  useEffect(() => {
    setShowOriginal(false);
  }, [id]);

  // 2. ACTION HANDLERS: The logic executed when a user clicks a button.
  const toggleFavorite = async () => {
    if (!user || !id) return showToast('Please sign in to favorite recipes!');
    if (favorite) {
      await db.favorites.delete(favorite.id);
      await supabase.from('favorites').delete().eq('id', favorite.id);
    } else {
      const newFav = { id: uuidv4(), recipe_id: id, user_id: user.id, created_at: new Date().toISOString() };
      await db.favorites.put(newFav);
      await supabase.from('favorites').insert(newFav);
    }
  };

  const handleHide = () => {
    if (!user || !id) return;
    setDialog({
      title: 'Hide Recipe',
      message: 'Hide this recipe from your personal vault? It will still be available to others.',
      confirmLabel: 'Hide',
      onConfirm: async () => {
        const hiddenRecordData = { id: uuidv4(), user_id: user.id, recipe_id: id, created_at: new Date().toISOString() };
        await db.user_hidden_recipes.put(hiddenRecordData); // Updates local instantly
        await supabase.from('user_hidden_recipes').insert(hiddenRecordData); // Syncs to cloud
        setDialog(null);
        showToast('Recipe hidden from your vault.');
      },
    });
  };

  const handleUnhide = async () => {
    if (!hiddenRecord) return;
    await db.user_hidden_recipes.delete(hiddenRecord.id);
    await supabase.from('user_hidden_recipes').delete().eq('id', hiddenRecord.id);
    showToast('Recipe unhidden.');
  };

  const handleDelete = () => {
    if (!user || !id) return;
    setDialog({
      title: 'Move to Trash',
      message: favorite
        ? 'This recipe is in your Favorites. Moving it to the Trash Bin will also remove it from your Favorites. Continue?'
        : 'Move this personal recipe to the Trash Bin?',
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async () => {
        const now = new Date().toISOString();
        await db.recipes.update(id, { deleted_at: now });
        await supabase.from('recipes').update({ deleted_at: now }).eq('id', id);

        if (favorite) {
          await db.favorites.delete(favorite.id);
          await supabase.from('favorites').delete().eq('id', favorite.id);
        }

        setDialog(null);
        navigate('/recipes');
      },
    });
  };

  const handleSubmitGlobal = () => {
    if (!user || !id) return;
    setDialog({
      title: 'Submit to Global Vault',
      message: 'Submit this recipe for approval to join the global family vault?',
      confirmLabel: 'Submit',
      onConfirm: async () => {
        await db.recipes.update(id, { visibility: 'pending_global' });
        await supabase.from('recipes').update({ visibility: 'pending_global' }).eq('id', id);

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

        setDialog(null);
        showToast('Sent for admin approval!');
      },
    });
  };

  // Saves (or replaces) the user's private note for this recipe, both locally and in the cloud.
  const upsertNote = async (noteText: string) => {
    if (!user || !id) return;
    const now = new Date().toISOString();
    if (myNote) {
      await db.user_recipe_notes.update(myNote.id, { note_text: noteText, updated_at: now });
      await supabase.from('user_recipe_notes').update({ note_text: noteText, updated_at: now }).eq('id', myNote.id);
    } else {
      const note = { id: uuidv4(), user_id: user.id, recipe_id: id, note_text: noteText, created_at: now, updated_at: now };
      await db.user_recipe_notes.put(note);
      await supabase.from('user_recipe_notes').insert(note);
    }
  };

  const saveNoteDraft = async () => {
    await upsertNote(noteDraft);
    showToast('Note saved.');
  };

  const handleRequestEdit = () => {
    if (!user || !id || !recipe) return;
    setEditFields({
      title: recipe.title || '',
      ingredients: formatIngredientList(recipe.ingredients).join('\n'),
      instructions: recipe.instructions || '',
      notes: recipe.notes || '',
    });
    setEditDialogOpen(true);
  };

  const handleSubmitEditForApproval = async () => {
    if (!user || !id) return;
    const proposedChanges = {
      title: editFields.title,
      ingredients: editFields.ingredients.split('\n').map(i => i.trim()).filter(i => i !== ''),
      instructions: editFields.instructions,
      notes: editFields.notes,
    };
    const request = {
      id: uuidv4(),
      recipe_id: id,
      requested_by: user.id,
      request_type: 'edit_global' as const,
      proposed_changes: proposedChanges,
      status: 'pending' as const,
      created_at: new Date().toISOString()
    };
    await db.approval_requests.put(request);
    await supabase.from('approval_requests').insert(request);
    setEditDialogOpen(false);
    showToast('Edit request submitted to admin!');
  };

  const handleRequestDelete = () => {
    if (!user || !id) return;
    setDialog({
      title: 'Request Deletion',
      message: 'Send a request to the admin to permanently delete this global recipe?',
      confirmLabel: 'Send Request',
      danger: true,
      onConfirm: async () => {
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
        setDialog(null);
        showToast('Deletion request submitted to admin!');
      },
    });
  };

  // 3. UI RENDERING: Loading states and safety checks
  if (recipe === undefined) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (recipe === null || recipe.deleted_at) return <div className="min-h-screen flex items-center justify-center">Recipe not found or deleted.</div>;

  // Evaluate permissions based on Schema V3 rules
  const isGlobal = recipe.visibility === 'global';
  const isOwner = recipe.owner_id === user?.id;
  const isPersonal = recipe.visibility === 'personal' || !recipe.visibility;
  const hasTranslation = !!(recipe.instructions_en || (recipe.ingredients_en && recipe.ingredients_en.length > 0));
  const useOriginal = showOriginal || !hasTranslation;
  const ingredientLines = formatIngredientList(useOriginal ? recipe.ingredients : recipe.ingredients_en);
  const instructionSteps = formatInstructionSteps(useOriginal ? recipe.instructions : recipe.instructions_en);

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

          <div className="flex flex-wrap items-center justify-between gap-6 mb-10 pb-10 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="w-5 h-5 text-orange-600" />
              <span>Total: {recipe.total_time_min}m</span>
            </div>
            {hasTranslation && (
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Languages className="w-4 h-4" />
                {showOriginal ? 'Show English' : 'Show Original'}
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-1">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Ingredients</h2>
              <ul className="space-y-3 text-slate-700">
                {ingredientLines.length > 0 ? (
                  ingredientLines.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2"><span className="text-orange-500 mt-1">•</span><span>{ing}</span></li>
                  ))
                ) : (
                  <p className="text-slate-400">No ingredients listed.</p>
                )}
              </ul>
            </div>
            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Instructions</h2>
              {instructionSteps.length > 0 ? (
                <ol className="space-y-4 text-slate-700 list-decimal list-outside pl-5 marker:text-orange-500 marker:font-semibold">
                  {instructionSteps.map((step, i) => (
                    <li key={i} className="pl-1">{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-slate-400">No instructions provided for this recipe.</p>
              )}
            </div>
          </div>

          {/* My Personal Notes: private per-user, separate from the shared recipe content */}
          {user && (
            <div className="mt-12 pt-8 border-t border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-orange-500" /> My Personal Notes
              </h2>
              <p className="text-sm text-slate-500 mb-3">Private to you — never shared or submitted to the global vault.</p>
              <textarea
                rows={4}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Jot down your own tweaks, substitutions, or reminders..."
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
              />
              <div className="flex justify-end mt-2">
                <button onClick={saveNoteDraft} className="flex items-center gap-2 text-sm bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-700 transition-colors">
                  <Save className="w-4 h-4" /> Save Note
                </button>
              </div>
            </div>
          )}

        </div>
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
      <EditRecipeDialog
        open={editDialogOpen}
        fields={editFields}
        onChange={setEditFields}
        onSubmitForApproval={handleSubmitEditForApproval}
        onCancel={() => setEditDialogOpen(false)}
      />
      <Toast message={toast} />
    </div>
  );
}
