import { useEffect, useRef, useState } from 'react';
import { X, Check, Timer, Pause, Play, RotateCcw, ListChecks } from 'lucide-react';

// Hands-free cooking HUD: high-contrast, oversized touch targets, step
// checkboxes and per-step timers. Fullscreen and self-contained so a phone
// propped against the backsplash works with wet knuckles. Keeps the screen
// awake while open via the Wake Lock API where available.

interface CookModeProps {
  title: string;
  ingredients: string[];
  steps: string[];
  onClose: () => void;
}

// Finds "20 min", "1 hour", "1 saat", "45 dakika" etc. in a step so the timer
// chip can be pre-set to what the recipe actually says.
function detectStepMinutes(step: string): number | null {
  const hours = step.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h\b|heures?|saat)/i);
  const mins = step.match(/(\d+)\s*(?:minutes?|mins?|min\b|dakika|dk)/i);
  if (!hours && !mins) return null;
  const total = Math.round((hours ? Number(hours[1].replace(',', '.')) * 60 : 0) + (mins ? Number(mins[1]) : 0));
  return total > 0 && total <= 24 * 60 ? total : null;
}

const formatClock = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

interface RunningTimer {
  stepIndex: number;
  secondsLeft: number;
  paused: boolean;
}

export function CookMode({ title, ingredients, steps, onClose }: CookModeProps) {
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));
  const [showIngredients, setShowIngredients] = useState(false);
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  // Keep the screen on for the duration. Best-effort: unsupported browsers
  // just fall back to their normal screen timeout.
  useEffect(() => {
    let released = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen')
      .then((lock) => { if (released) lock.release(); else wakeLockRef.current = lock; })
      .catch(() => { /* denied or unsupported -- fine */ });
    return () => {
      released = true;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // One ticking interval drives whichever timer is active.
  useEffect(() => {
    if (!timer || timer.paused || timer.secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setTimer((t) => (t && !t.paused ? { ...t, secondsLeft: Math.max(0, t.secondsLeft - 1) } : t));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const timerExpired = timer !== null && timer.secondsLeft === 0;

  // Buzz when a timer hits zero (where vibration exists).
  useEffect(() => {
    if (timerExpired) navigator.vibrate?.([300, 150, 300, 150, 600]);
  }, [timerExpired]);

  const toggleStep = (i: number) =>
    setDone((d) => d.map((v, idx) => (idx === i ? !v : v)));

  const completed = done.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950 text-slate-50 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe border-b border-slate-800 shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Cook Mode</p>
          <h2 className="text-lg font-bold truncate">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIngredients((s) => !s)}
            className={`p-3 min-h-[44px] min-w-[44px] rounded-xl transition-colors ${showIngredients ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300'}`}
            title="Toggle ingredients"
          >
            <ListChecks className="w-6 h-6" />
          </button>
          <button
            onClick={onClose}
            className="p-3 min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            title="Exit cook mode"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 py-2 shrink-0 border-b border-slate-800">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
          <span>{completed} of {steps.length} steps done</span>
          <span>{Math.round((completed / Math.max(1, steps.length)) * 100)}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${(completed / Math.max(1, steps.length)) * 100}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-safe">
        {showIngredients && (
          <div className="mb-6 bg-slate-900 rounded-2xl p-4 border border-slate-800">
            <h3 className="text-sm font-bold uppercase tracking-widest text-orange-400 mb-3">Ingredients</h3>
            <ul className="space-y-2 text-lg leading-snug">
              {ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">•</span>
                  <span>{ing}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="space-y-3">
          {steps.map((step, i) => {
            const minutes = detectStepMinutes(step);
            const isTiming = timer?.stepIndex === i;
            return (
              <li key={i}>
                <button
                  onClick={() => toggleStep(i)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                    done[i]
                      ? 'bg-slate-900/60 border-slate-800 text-slate-500'
                      : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  <span
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-2 text-base font-bold mt-0.5 ${
                      done[i] ? 'bg-green-600 border-green-600 text-white' : 'border-slate-600 text-slate-300'
                    }`}
                  >
                    {done[i] ? <Check className="w-5 h-5" /> : i + 1}
                  </span>
                  <span className={`text-xl leading-relaxed ${done[i] ? 'line-through' : ''}`}>{step}</span>
                </button>

                {minutes != null && !done[i] && (
                  <div className="ml-14 mt-2">
                    {isTiming ? (
                      <div className={`inline-flex items-center gap-3 rounded-xl px-4 py-2 font-mono text-2xl font-bold ${
                        timerExpired && isTiming ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-orange-300'
                      }`}>
                        <Timer className="w-6 h-6" />
                        {timerExpired ? 'Done!' : formatClock(timer!.secondsLeft)}
                        {!timerExpired && (
                          <button
                            onClick={() => setTimer((t) => (t ? { ...t, paused: !t.paused } : t))}
                            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                            title={timer!.paused ? 'Resume' : 'Pause'}
                          >
                            {timer!.paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                          </button>
                        )}
                        <button
                          onClick={() => setTimer(null)}
                          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                          title="Clear timer"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setTimer({ stepIndex: i, secondsLeft: minutes * 60, paused: false })}
                        className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-slate-800 text-orange-300 font-semibold hover:bg-slate-700 active:scale-95 transition-all"
                      >
                        <Timer className="w-5 h-5" /> Start {minutes} min timer
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {completed === steps.length && steps.length > 0 && (
          <div className="mt-8 mb-4 text-center bg-green-950/60 border border-green-800 rounded-2xl p-6">
            <p className="text-2xl font-bold text-green-300">Afiyet olsun! 🍽️</p>
            <p className="text-slate-400 mt-1">All steps done — don't forget to log the cook.</p>
          </div>
        )}
      </div>
    </div>
  );
}
