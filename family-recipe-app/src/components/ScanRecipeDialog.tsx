import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, ScanText, Save, Loader2, AlertTriangle } from 'lucide-react';
import { extractTextFromImage, parseRecipeText } from '../lib/ocr';
import { type ScanDraftFields, EMPTY_SCAN_DRAFT } from '../lib/recipeDraft';

// The OCR review drawer: everything a scanned recipe needs before it can be
// saved, all of it editable -- OCR on handwritten notebook pages WILL misread
// things, and this drawer is the checkpoint where a human fixes them before
// anything persists. Field shape lives in lib/recipeDraft.ts.

interface ScanRecipeDialogProps {
  /** The captured/uploaded image. Dialog is open whenever this is set. */
  file: File | null;
  saving: boolean;
  onSave: (fields: ScanDraftFields) => void;
  onCancel: () => void;
}

type OcrPhase = 'running' | 'done' | 'failed';

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors';

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer hover:border-orange-300 transition-colors min-h-[44px]">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 w-5 h-5 accent-orange-600" />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export function ScanRecipeDialog({ file, saving, onSave, onCancel }: ScanRecipeDialogProps) {
  const [fields, setFields] = useState<ScanDraftFields>(EMPTY_SCAN_DRAFT);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<OcrPhase>('running');
  const [progress, setProgress] = useState(0);

  // Zoom/pan for reading small handwriting against the form.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setFields(EMPTY_SCAN_DRAFT);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPhase('running');
    setProgress(0);

    let cancelled = false;
    extractTextFromImage(file, (pct) => { if (!cancelled) setProgress(pct); })
      .then((text) => {
        if (cancelled) return;
        const draft = parseRecipeText(text);
        setFields((f) => ({
          ...f,
          title: draft.title || f.title,
          prepTime: draft.prep_time_min ?? f.prepTime,
          cookTime: draft.cook_time_min ?? f.cookTime,
          servings: draft.base_servings ?? f.servings,
          ingredients: draft.ingredients,
          instructions: draft.instructions,
        }));
        setPhase('done');
      })
      .catch((err) => {
        console.error('OCR failed:', err);
        if (!cancelled) setPhase('failed');
      });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!file) return null;

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

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
  };
  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPan({ x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) });
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-6">
      <div className="bg-white w-full h-full md:h-[90vh] md:max-w-6xl md:rounded-2xl md:shadow-2xl md:border md:border-slate-100 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-100 shrink-0 pt-safe">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ScanText className="w-5 h-5 text-orange-600" /> Review Scanned Recipe
          </h3>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Close">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body: stacked on phones, side-by-side on desktop */}
        <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-2">

          {/* Visual pane: the scan, with zoom/pan */}
          <div className="relative h-56 md:h-auto shrink-0 md:shrink bg-slate-900 overflow-hidden touch-none select-none"
            onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Uploaded recipe scan"
                draggable={false}
                className="w-full h-full object-contain"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
              />
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1 backdrop-blur-sm">
              <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="p-2 text-white/80 hover:text-white" title="Zoom out">
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white/80 text-xs font-semibold w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(6, z + 0.5))} className="p-2 text-white/80 hover:text-white" title="Zoom in">
                <ZoomIn className="w-5 h-5" />
              </button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-2 text-white/80 hover:text-white" title="Reset view">
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            {phase === 'running' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 text-white text-xs font-semibold rounded-full px-4 py-2 backdrop-blur-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Reading the scan… {progress}%
              </div>
            )}
          </div>

          {/* Editable pane: the parsed draft, fully correctable */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
            {phase === 'running' && (
              <p className="text-sm text-slate-500 bg-orange-50 border border-orange-100 rounded-lg p-3">
                Extracting text from the picture — you can already start correcting fields below.
              </p>
            )}
            {phase === 'failed' && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                Couldn't read the image automatically (this needs a network connection the first time). Type the recipe in below — the scan will still be attached.
              </p>
            )}
            {phase === 'done' && (
              <p className="text-sm text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                Auto-read from the scan. Check it against the picture — handwriting and accents often come through wrong.
              </p>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Title *</label>
              <input type="text" value={fields.title} onChange={set('title')} className={inputClass} placeholder="e.g., Anne's Köfte" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Prep (min)</label>
                <input type="number" min={0} value={fields.prepTime} onChange={set('prepTime')} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Cook (min)</label>
                <input type="number" min={0} value={fields.cookTime} onChange={set('cookTime')} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Servings</label>
                <input type="number" min={1} value={fields.servings} onChange={set('servings')} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Dish Type</label>
                <select value={fields.dishType} onChange={set('dishType')} className={inputClass}>
                  {['Main Dish', 'Appetizer', 'Dessert', 'Pastry', 'Soup', 'Sauce', 'Side', 'Breakfast', 'Drink'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Complexity</label>
                <select value={fields.complexity} onChange={set('complexity')} className={inputClass}>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Cuisine</label>
                <input type="text" value={fields.cuisine} onChange={set('cuisine')} className={inputClass} placeholder="Turkish, French…" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Ingredients <span className="text-slate-400 font-normal">(one per line)</span> *
              </label>
              <textarea rows={7} value={fields.ingredients} onChange={set('ingredients')} className={`${inputClass} font-mono text-sm`} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Instructions *</label>
              <textarea rows={8} value={fields.instructions} onChange={set('instructions')} className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Family Notes</label>
              <textarea rows={2} value={fields.notes} onChange={set('notes')} className={inputClass} />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <p className="text-sm font-bold text-slate-800">Kitchen metadata</p>
              <Toggle label="Genuine main dish" hint="Carries a whole meal on its own" checked={fields.isMainDish} onChange={set('isMainDish')} />
              <Toggle label="College staple" hint="Quick, budget-friendly, high-yield" checked={fields.collegeStaple} onChange={set('collegeStaple')} />
              <Toggle label="Meal-prep friendly" hint="Holds up in the fridge and reheats well" checked={fields.mealPrepFriendly} onChange={set('mealPrepFriendly')} />
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Tags <span className="text-slate-400 font-normal">(comma-separated)</span>
                </label>
                <input type="text" value={fields.tags} onChange={set('tags')} className={inputClass} placeholder="Köfte, Rice, One-Pan, Quick Prep" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-4 md:px-6 py-3 border-t border-slate-100 shrink-0 pb-safe">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 min-h-[44px] rounded-lg text-slate-600 font-semibold hover:bg-slate-100 active:scale-95 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(fields)}
            disabled={saving || !fields.title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 min-h-[44px] rounded-lg text-white bg-orange-600 font-bold hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Saving…' : 'Save to Vault'}
          </button>
        </div>
      </div>
    </div>
  );
}
