import { useEffect, useState } from 'react';
import { X, Save, Loader2, Edit3 } from 'lucide-react';
import type { Recipe } from '../lib/db';
import { type ScanDraftFields, EMPTY_SCAN_DRAFT, fieldsFromRecipe } from '../lib/recipeDraft';

// Admin-only direct editor used by the review sweep. Unlike EditRecipeDialog
// (which routes through the approval queue), this writes straight to the
// recipe -- admins ARE the approval queue. It shares ScanDraftFields with the
// OCR drawer so both paths produce identical metadata shapes.

interface RecipeQuickEditDialogProps {
  recipe: Recipe | null;
  saving: boolean;
  onSave: (fields: ScanDraftFields) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors';

export function RecipeQuickEditDialog({ recipe, saving, onSave, onCancel }: RecipeQuickEditDialogProps) {
  const [fields, setFields] = useState<ScanDraftFields>(EMPTY_SCAN_DRAFT);

  useEffect(() => {
    if (recipe) setFields(fieldsFromRecipe(recipe));
  }, [recipe]);

  if (!recipe) return null;

  const set = <K extends keyof ScanDraftFields>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = e.target;
      const value = target instanceof HTMLInputElement && target.type === 'checkbox'
        ? target.checked
        : target instanceof HTMLInputElement && target.type === 'number'
          ? Number(target.value)
          : target.value;
      setFields((f) => ({ ...f, [key]: value }));
    };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 border border-slate-100 flex flex-col max-h-full">
        <div className="flex items-start justify-between mb-1 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-orange-600" /> Edit Recipe
          </h3>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-slate-500 text-sm mb-4 shrink-0">
          Direct edit — changes apply immediately, no approval round-trip.
        </p>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-title">Title</label>
            <input id="recipequickeditdialog-title" type="text" value={fields.title} onChange={set('title')} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-dish-type">Dish Type</label>
              <select id="recipequickeditdialog-dish-type" value={fields.dishType} onChange={set('dishType')} className={inputClass}>
                {['Main Dish', 'Appetizer', 'Dessert', 'Pastry', 'Soup', 'Sauce', 'Side', 'Breakfast', 'Drink'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-complexity">Complexity</label>
              <select id="recipequickeditdialog-complexity" value={fields.complexity} onChange={set('complexity')} className={inputClass}>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-cuisine">Cuisine</label>
              <input id="recipequickeditdialog-cuisine" type="text" value={fields.cuisine} onChange={set('cuisine')} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-prep">Prep (min)</label>
              <input id="recipequickeditdialog-prep" type="number" min={0} value={fields.prepTime} onChange={set('prepTime')} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-cook">Cook (min)</label>
              <input id="recipequickeditdialog-cook" type="number" min={0} value={fields.cookTime} onChange={set('cookTime')} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-servings">Servings</label>
              <input id="recipequickeditdialog-servings" type="number" min={1} value={fields.servings} onChange={set('servings')} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Ingredients <span className="text-slate-400 font-normal">(one per line)</span>
            </label>
            <textarea rows={6} value={fields.ingredients} onChange={set('ingredients')} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-instructions">Instructions</label>
            <textarea id="recipequickeditdialog-instructions" rows={6} value={fields.instructions} onChange={set('instructions')} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="recipequickeditdialog-notes">Notes</label>
            <textarea id="recipequickeditdialog-notes" rows={2} value={fields.notes} onChange={set('notes')} className={inputClass} />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <p className="text-sm font-bold text-slate-800">Kitchen metadata</p>
            <div className="grid sm:grid-cols-3 gap-2">
              {([
                ['isMainDish', 'Genuine main dish'],
                ['collegeStaple', 'College staple'],
                ['mealPrepFriendly', 'Meal-prep friendly'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 p-3 min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:border-orange-300 transition-colors">
                  <input type="checkbox" checked={fields[key]} onChange={set(key)} className="w-5 h-5 accent-orange-600" />
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Tags <span className="text-slate-400 font-normal">(comma-separated)</span>
              </label>
              <input type="text" value={fields.tags} onChange={set('tags')} className={inputClass} placeholder="Köfte, Rice, One-Pan, Quick Prep" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-slate-100 shrink-0">
          <button onClick={onCancel} className="px-4 py-2 min-h-[44px] rounded-lg text-slate-600 font-semibold hover:bg-slate-100 active:scale-95 transition-all">
            Cancel
          </button>
          <button
            onClick={() => onSave(fields)}
            disabled={saving || !fields.title.trim()}
            className="flex items-center gap-2 px-5 py-2 min-h-[44px] rounded-lg text-white bg-orange-600 font-semibold hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
