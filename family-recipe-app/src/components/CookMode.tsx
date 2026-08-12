import { useEffect, useRef, useState } from 'react';
import { X, Check, Timer, Pause, Play, RotateCcw, ListChecks, ChevronDown } from 'lucide-react';

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

  const hourMinutes = hours ? Number(hours[1].replace(',', '.')) * 60 : 0;
  const minMinutes = mins ? Number(mins[1]) : 0;

  // Only add the two together when the hours are stated FIRST, as in
  // "1 hr 30 min". Blindly summing turned "chill for 30 minutes to 1 hour"
  // into a 90 minute timer -- it is a range, not a total. When the minutes
  // come first the step is offering a span, so take the lower bound: it is
  // always possible to give it longer, but not to un-chill a pastry.
  const isSum = hours != null && mins != null && hours.index! < mins.index!;
  const total = Math.round(
    isSum ? hourMinutes + minMinutes : (mins != null ? minMinutes : hourMinutes),
  );
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
  const audioRef = useRef<AudioContext | null>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  // The alarm has to be AUDIBLE, not haptic: navigator.vibrate does nothing
  // in iOS Safari, and this family cooks from iPhones. Web Audio also refuses
  // to make noise from a context created outside a user gesture there, so the
  // context is built when the cook taps "start timer" -- the one moment a
  // gesture is guaranteed -- and merely resumed later.
  const armAlarm = () => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioRef.current ??= new Ctor();
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
    } catch {
      // No audio available; the flashing red chip is still there.
    }
  };

  const playAlarm = () => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const start = ctx.currentTime;
      // Three separated beeps carry over a range hood better than one long
      // tone, and the ramps avoid the click a bare gain switch produces.
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        const at = start + i * 0.45;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.36);
      }
    } catch {
      // Autoplay policy still blocked it -- nothing else to do.
    }
  };

  useEffect(() => () => { void audioRef.current?.close().catch(() => {}); }, []);

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

  // Sound the alarm when a timer hits zero. Vibration is kept as a bonus for
  // Android, but it is the beep that does the work.
  useEffect(() => {
    if (!timerExpired) return;
    playAlarm();
    navigator.vibrate?.([300, 150, 300, 150, 600]);
  }, [timerExpired]);

  const toggleStep = (i: number) =>
    setDone((d) => d.map((v, idx) => (idx === i ? !v : v)));

  const completed = done.filter(Boolean).length;
  // The first unfinished step -- what the big bottom bar acts on.
  const currentIndex = done.findIndex((d) => !d);

  const advance = () => {
    if (currentIndex === -1) return;
    setDone((d) => d.map((v, i) => (i === currentIndex ? true : v)));
    navigator.vibrate?.(30);
    // Bring the next step to the middle of the screen so the cook does not
    // have to find their place with dirty hands.
    stepRefs.current[currentIndex + 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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

      {/* Body -- bottom padding lives on the Next Step bar below instead. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
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
              <li key={i} ref={(el) => { stepRefs.current[i] = el; }}>
                <button
                  onClick={() => toggleStep(i)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl border transition-all active:scale-[0.99] ${
                    done[i]
                      // slate-500 on a 60%-alpha panel measured 3.75:1, under
                      // the 4.5:1 AA floor. slate-400 on the solid panel is
                      // ~7:1 and still reads as finished next to the
                      // strike-through and green tick.
                      ? 'bg-slate-900 border-slate-800 text-slate-400'
                      : 'bg-slate-900 border-slate-700'
                  } ${i === currentIndex ? 'ring-2 ring-orange-500' : ''}`}
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
                        onClick={() => {
                          armAlarm(); // must happen inside the tap, for iOS
                          setTimer({ stepIndex: i, secondsLeft: minutes * 60, paused: false });
                        }}
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

      {/* One target big enough to hit with a knuckle or the back of a hand.
          Tapping the small step circles is the thing that fails when your
          fingers are covered in flour, so the primary action gets the full
          width of the screen and advances the list on its own. */}
      {currentIndex !== -1 && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-3 pb-safe">
          <button
            onClick={advance}
            className="w-full min-h-[64px] rounded-2xl bg-orange-600 text-white text-xl font-bold flex items-center justify-center gap-3 active:scale-[0.99] hover:bg-orange-500 transition-all"
          >
            <Check className="w-6 h-6" />
            Step {currentIndex + 1} done
            {currentIndex + 1 < steps.length && <ChevronDown className="w-6 h-6 opacity-80" />}
          </button>
        </div>
      )}
    </div>
  );
}
