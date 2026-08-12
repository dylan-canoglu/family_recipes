import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/i18n';
import { requestRecipeTranslation } from '../lib/translateRequest';
import { HOUSEHOLD_ID } from '../lib/constants';
import { pushRecipeToCloud } from '../lib/recipes';
import { PlusCircle, Clock, ChefHat, Save, LogIn, Camera, PenLine } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ScanRecipeDialog } from '../components/ScanRecipeDialog';
import { type ScanDraftFields } from '../lib/recipeDraft';
import { Toast } from '../components/Toast';

export function AddRecipe() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scan-and-review path: pick/take a photo, correct the OCR draft, save.
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanSaving, setScanSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const handleScanSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // Reset so re-picking the same photo re-triggers onChange.
    e.target.value = '';
    if (file) setScanFile(file);
  };

  const handleScanSave = async (fields: ScanDraftFields) => {
    if (!user || !scanFile) return;
    setScanSaving(true);
    setError(null);
    try {
      const newId = uuidv4();

      // The scan itself is archival: it becomes image_path, the "Verify
      // Original" face of the recipe -- NOT a display thumbnail (those come
      // from recipe_photos of the finished dish).
      const ext = scanFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      let scanUrl = '';
      const storagePath = `scans/${newId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('recipe-images').upload(storagePath, scanFile);
      if (!uploadError) {
        scanUrl = supabase.storage.from('recipe-images').getPublicUrl(storagePath).data.publicUrl;
      } else {
        console.error('Scan upload failed:', uploadError);
      }

      const tags = fields.tags.split(',').map((t) => t.trim()).filter((t) => t !== '');
      const baseRecipe = {
        id: newId,
        household_id: HOUSEHOLD_ID,
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
        image_path: scanUrl,
        source_type: 'family' as const,
        source_url: '',
        owner_id: user.id,
        visibility: 'personal' as const,
        deleted_at: null,
        is_main_dish: fields.isMainDish,
        college_staple: fields.collegeStaple,
        meal_prep_friendly: fields.mealPrepFriendly,
        tags,
      };

      // total_time_min is GENERATED ALWAYS in Supabase, so it is omitted from
      // the cloud insert and computed locally for Dexie (same as the form path).
      const { error: cloudError, strippedMetadata } = await pushRecipeToCloud(baseRecipe);
      if (cloudError) throw cloudError;

      await db.recipes.put({
        ...baseRecipe,
        total_time_min: (Number(fields.prepTime) || 0) + (Number(fields.cookTime) || 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (strippedMetadata) {
        showToast('Saved — but run supabase-college-metadata.sql to sync the new metadata fields.');
      }
      // Translate in the background: the recipe is already saved, so a failure
      // here costs nothing but the translation.
      requestRecipeTranslation(newId, lang);
      setScanFile(null);
      navigate(`/recipes/${newId}`);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to save the scanned recipe.');
    } finally {
      setScanSaving(false);
    }
  };

  // Form State
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [dishType, setDishType] = useState('Main Dish');
  const [complexity, setComplexity] = useState('Medium');
  const [prepTime, setPrepTime] = useState(15);
  const [cookTime, setCookTime] = useState(30);
  const [servings, setServings] = useState(4);
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return setError("You must be logged in to add a recipe.");

    setLoading(true);
    setError(null);

    // 1. Prepare the data
    const newId = uuidv4();
    // Parse ingredients from a simple multiline text box into an array
    const parsedIngredients = ingredients.split('\n').map(i => i.trim()).filter(i => i !== '');

    // Note: Your Supabase table calculates total_time_min automatically via GENERATED ALWAYS.
    // If we send total_time_min in the Supabase insert, it will crash.
    // We omit it for Supabase, but calculate it locally for Dexie.
    const baseRecipe = {
        id: newId,
        household_id: HOUSEHOLD_ID,
        title,
        cuisine: cuisine || null,
        dish_type: dishType as any,
        complexity: complexity as any,
        prep_time_min: Number(prepTime),
        cook_time_min: Number(cookTime),
        base_servings: Number(servings),
        ingredients: parsedIngredients,
        instructions,
        notes,
        image_path: '',
        source_type: 'manual' as const,
        source_url: '',
        // --- THE NEW FIELDS ---
        owner_id: user.id,
        visibility: 'personal' as const,
        deleted_at: null,
      };

    try {
      // 2. Push to Supabase (Cloud)
      const { error: supabaseError } = await supabase.from('recipes').insert([baseRecipe]);

      if (supabaseError) throw supabaseError;

      // 3. Save to Dexie (Local Offline Vault)
      await db.recipes.put({
        ...baseRecipe,
        total_time_min: Number(prepTime) + Number(cookTime),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // 4. Success! Redirect to the new recipe's page
      requestRecipeTranslation(newId, lang);
      navigate(`/recipes/${newId}`);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save recipe. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Match the other authenticated pages: prompt up front rather than letting
  // someone fill in a whole recipe and only fail at submit.
  if (!user) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-orange-50 p-6 rounded-full mb-6">
          <PlusCircle className="w-12 h-12 text-orange-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('add.signInTitle')}</h2>
        <p className="text-slate-500 mb-8 max-w-md">
          {t('add.signInBody')}
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

  return (
    <div className="min-h-full p-6 md:p-12">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="bg-orange-50 border-b border-orange-100 p-8 flex items-center gap-4">
          <div className="bg-orange-100 p-3 rounded-full text-orange-600">
            <PlusCircle className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Add New Recipe</h1>
            <p className="text-orange-700 mt-1">Contribute a new dish to the family vault.</p>
          </div>
        </div>

        {/* Primary path: photograph a notebook page and review the OCR draft.
            The long form below stays as the manual fallback. */}
        <div className="p-8 pb-0">
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleScanSelected}
          />
          <button
            type="button"
            onClick={() => scanInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 bg-orange-600 text-white px-6 py-4 min-h-[44px] rounded-xl font-bold text-lg hover:bg-orange-700 active:scale-[0.98] transition-all shadow-sm"
          >
            <Camera className="w-6 h-6" /> {t('add.scanButton')}
          </button>
          <p className="text-center text-sm text-slate-400 mt-3">
            {t('add.scanHint')}
          </p>
          {/* Said before the scan, not after it fails. Automatic reading works
              on printed and neatly hand-printed pages; it cannot follow
              joined-up handwriting, and finding that out after uploading is a
              waste of the cook's time. */}
          <p className="text-center text-xs text-slate-400 mt-2 flex items-start justify-center gap-1.5 max-w-md mx-auto">
            <PenLine className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold text-slate-500">{t('add.handwritingWarningStrong')}</strong>{' '}
              {t('add.handwritingWarningRest')}
            </span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          {/* Basic Info Group */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <ChefHat className="w-5 h-5 text-orange-500" /> Basic Details
            </h3>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-recipe-title">Recipe Title *</label>
              <input id="addrecipe-recipe-title"
                type="text" required value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
                placeholder="e.g., Grand-mère's Quiche Lorraine"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-dish-type">Dish Type *</label>
                <select id="addrecipe-dish-type"
                  value={dishType} onChange={e => setDishType(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                >
                  {['Main Dish', 'Appetizer', 'Dessert', 'Pastry', 'Soup', 'Sauce', 'Side', 'Breakfast', 'Drink'].map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-complexity">Complexity *</label>
                <select id="addrecipe-complexity"
                  value={complexity} onChange={e => setComplexity(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-cuisine">Cuisine</label>
                <input id="addrecipe-cuisine"
                  type="text" value={cuisine} onChange={e => setCuisine(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                  placeholder="e.g., French, Turkish"
                />
              </div>
            </div>
          </div>

          {/* Time & Yield Group */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Clock className="w-5 h-5 text-orange-500" /> Time & Yield
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-prep-time">Prep Time (min)</label>
                <input id="addrecipe-prep-time"
                  type="number" min="0" required value={prepTime} onChange={e => setPrepTime(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-cook-time">Cook Time (min)</label>
                <input id="addrecipe-cook-time"
                  type="number" min="0" required value={cookTime} onChange={e => setCookTime(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-servings">Servings</label>
                <input id="addrecipe-servings"
                  type="number" min="1" required value={servings} onChange={e => setServings(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Directions Group */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Ingredients <span className="text-slate-400 font-normal">(One per line)</span> *
              </label>
              <textarea
                required rows={6} value={ingredients} onChange={e => setIngredients(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                placeholder="2 cups flour&#10;1 tsp salt&#10;3 large eggs..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-instructions">Instructions *</label>
              <textarea id="addrecipe-instructions"
                required rows={8} value={instructions} onChange={e => setInstructions(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                placeholder="1. Preheat the oven to 180°C...&#10;2. Whisk the eggs..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="addrecipe-family-notes">Family Notes (Optional)</label>
              <textarea id="addrecipe-family-notes"
                rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
                placeholder="Ergun always adds an extra pinch of black pepper..."
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit" disabled={loading}
              className="flex items-center gap-2 bg-orange-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : <><Save className="w-5 h-5" /> Save to Vault</>}
            </button>
          </div>
        </form>
      </div>

      <ScanRecipeDialog
        file={scanFile}
        saving={scanSaving}
        onSave={handleScanSave}
        onCancel={() => setScanFile(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
