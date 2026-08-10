import { X } from 'lucide-react';

export interface EditRecipeFields {
  title: string;
  ingredients: string;
  instructions: string;
  notes: string;
}

interface EditRecipeDialogProps {
  open: boolean;
  fields: EditRecipeFields;
  onChange: (fields: EditRecipeFields) => void;
  onSubmitForApproval: () => void;
  onSaveAsNote: () => void;
  onCancel: () => void;
}

export function EditRecipeDialog({
  open,
  fields,
  onChange,
  onSubmitForApproval,
  onSaveAsNote,
  onCancel,
}: EditRecipeDialogProps) {
  if (!open) return null;

  const set = (key: keyof EditRecipeFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...fields, [key]: e.target.value });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 flex flex-col max-h-full">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-lg font-bold text-slate-900">Suggest Changes</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-slate-500 text-sm mb-5">
          Edit any fields below, then either send it to the admin for the global vault, or keep it just for yourself.
        </p>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Title</label>
            <input
              type="text" value={fields.title} onChange={set('title')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Ingredients <span className="text-slate-400 font-normal">(one per line)</span>
            </label>
            <textarea
              rows={5} value={fields.ingredients} onChange={set('ingredients')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Instructions</label>
            <textarea
              rows={5} value={fields.instructions} onChange={set('instructions')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows={3} value={fields.notes} onChange={set('notes')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-slate-100 shrink-0">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-slate-600 font-semibold hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={onSaveAsNote} className="px-4 py-2 rounded-lg text-orange-700 bg-orange-50 font-semibold hover:bg-orange-100 transition-colors">
            Keep as My Note Only
          </button>
          <button onClick={onSubmitForApproval} className="px-4 py-2 rounded-lg text-white bg-blue-600 font-semibold hover:bg-blue-700 transition-colors">
            Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}
