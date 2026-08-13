import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useT } from '../lib/i18n';

// Full-screen viewer for the archival notebook scans.
//
// In the flip card the scan renders inside a 420px box at object-contain, so a
// page of handwriting comes out too small to read -- which defeats the point
// of keeping the original. Tapping it opens this instead.
//
// It opens ZOOMED, not fitted: the reason to open a scan is to read it, so the
// starting scale fills the viewport rather than showing the whole page in
// miniature. Pinch, wheel and the buttons take it further.

const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** Even on a wide screen, open somewhat magnified rather than merely fitted. */
const MIN_OPENING_SCALE = 1.8;

interface ImageZoomViewerProps {
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function ImageZoomViewer({ src, alt, onClose }: ImageZoomViewerProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(MIN_OPENING_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // The ref, not the state, is the source of truth for the gesture maths.
  // React batches state within a tick, so reading `scale` from the render
  // closure made four rapid zoom clicks all compute from the same starting
  // value and apply a single step. The ref updates synchronously.
  const scaleRef = useRef(MIN_OPENING_SCALE);

  // Live pointers, so one finger pans and two pinch without extra state.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /**
   * The image's untransformed (object-contain) size in the container.
   *
   * Derived from natural dimensions rather than measured off the element,
   * because getBoundingClientRect reports the *transformed* box -- dividing
   * that back out couples the clamp to the very scale it is trying to clamp.
   */
  const baseSize = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img?.naturalWidth) return null;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const aspect = img.naturalWidth / img.naturalHeight;
    let w = cw;
    let h = cw / aspect;
    if (h > ch) {
      h = ch;
      w = ch * aspect;
    }
    return { w, h, cw, ch };
  }, []);

  /** How far the image may be dragged before its edge enters the viewport. */
  const clampOffset = useCallback((next: { x: number; y: number }, atScale: number) => {
    const base = baseSize();
    if (!base) return next;
    const maxX = Math.max(0, (base.w * atScale - base.cw) / 2);
    const maxY = Math.max(0, (base.h * atScale - base.ch) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, [baseSize]);

  const applyScale = useCallback((next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    scaleRef.current = clamped;
    setScale(clamped);
    setOffset((o) => clampOffset(o, clamped));
  }, [clampOffset]);

  // Open filling the viewport. Measured once the image has its dimensions,
  // since the right starting scale depends on the page's aspect ratio.
  const fitToFill = useCallback(() => {
    const base = baseSize();
    if (!base || !base.w || !base.h) return;
    const cover = Math.max(base.cw / base.w, base.ch / base.h);
    const opening = Math.min(MAX_SCALE, Math.max(MIN_OPENING_SCALE, cover));
    scaleRef.current = opening;
    setScale(opening);
    setOffset({ x: 0, y: 0 });
  }, [baseSize]);

  // Reset whenever a different image is opened.
  useEffect(() => {
    if (!src) return;
    scaleRef.current = MIN_OPENING_SCALE;
    setScale(MIN_OPENING_SCALE);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') applyScale(scaleRef.current + 0.5);
      if (e.key === '-') applyScale(scaleRef.current - 0.5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose, applyScale]);

  if (!src) return null;

  const distanceBetween = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    // Capture keeps a drag alive if the finger leaves the element, but it
    // throws for a pointer the browser doesn't consider active. Letting that
    // escape would abort the handler before the pointer is even tracked,
    // killing pan and pinch outright -- the capture is an optimisation, not a
    // prerequisite.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable; the gesture still works via the container handlers */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      pinchStart.current = { distance: distanceBetween(pts[0], pts[1]), scale: scaleRef.current };
      panStart.current = null;
    } else if (pts.length === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length === 2 && pinchStart.current) {
      const ratio = distanceBetween(pts[0], pts[1]) / pinchStart.current.distance;
      applyScale(pinchStart.current.scale * ratio);
      return;
    }
    if (pts.length === 1 && panStart.current) {
      const next = {
        x: panStart.current.ox + (e.clientX - panStart.current.x),
        y: panStart.current.oy + (e.clientY - panStart.current.y),
      };
      setOffset(clampOffset(next, scaleRef.current));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  };

  // Trackpad pinch arrives as a wheel event with ctrlKey set; a plain wheel is
  // treated as zoom too, since there is nothing else to scroll in here.
  const onWheel = (e: React.WheelEvent) => {
    applyScale(scaleRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-950/95 flex flex-col animate-in fade-in duration-150">
      {/* Toolbar. pt-safe keeps it clear of the notch. */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe shrink-0 text-slate-200">
        <span className="text-sm font-semibold truncate">{alt}</span>
        <button
          onClick={onClose}
          title={t('common.close')}
          className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        onDoubleClick={() => (scaleRef.current > MIN_OPENING_SCALE ? applyScale(MIN_OPENING_SCALE) : applyScale(4))}
        // touch-none: the browser's own pan/zoom would otherwise swallow the
        // pointer events this component needs.
        className="flex-1 min-h-0 overflow-hidden touch-none select-none flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={fitToFill}
          className="max-w-full max-h-full object-contain will-change-transform"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>

      <div className="shrink-0 flex items-center justify-center gap-2 p-3 pb-safe">
        <button
          onClick={() => applyScale(scaleRef.current - 0.5)}
          title={t('scan.zoomOut')}
          className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-slate-300 text-sm font-mono font-semibold w-16 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => applyScale(scaleRef.current + 0.5)}
          title={t('scan.zoomIn')}
          className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={fitToFill}
          title={t('scan.resetView')}
          className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
