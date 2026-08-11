import { X, CookingPot } from 'lucide-react';
import { StarRating } from './StarRating';

export interface CookLogFields {
  cooked_at: string; // yyyy-mm-dd, as produced by <input type="date">
  rating: number;
  notes: string;
}

interface LogCookDialogProps {
  open: boolean;
  fields: CookLogFields;
  onChange: (fields: CookLogFields) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export function LogCookDialog({ open, fields, onChange, onSave, onCancel, saving }: LogCookDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CookingPot className="w-5 h-5 text-orange-500" /> Log a Cook
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-slate-600 text-sm mb-5">Record that you made this dish, and how it turned out.</p>

        <label className="block text-sm font-semibold text-slate-700 mb-1">When did you cook it?</label>
        <input
          type="date"
          value={fields.cooked_at}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange({ ...fields, cooked_at: e.target.value })}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-5 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
        />

        <label className="block text-sm font-semibold text-slate-700 mb-2">How did it turn out?</label>
        <div className="flex items-center gap-3 mb-5">
          <StarRating size="lg" value={fields.rating} onChange={(rating) => onChange({ ...fields, rating })} />
          <span className="text-sm text-slate-500">
            {fields.rating > 0 ? `${fields.rating} / 5` : 'No rating yet'}
          </span>
        </div>

        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Notes <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={fields.notes}
          onChange={(e) => onChange({ ...fields, notes: e.target.value })}
          placeholder="Doubled the garlic, baked 10 minutes longer..."
          className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-5 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-slate-600 font-semibold hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || fields.rating === 0}
            className="px-4 py-2 rounded-lg text-white font-semibold bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:hover:bg-orange-600"
            title={fields.rating === 0 ? 'Pick a star rating first' : undefined}
          >
            {saving ? 'Saving...' : 'Save Cook'}
          </button>
        </div>
      </div>
    </div>
  );
}
