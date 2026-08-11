import type { ReactNode } from 'react';

interface FlipCardProps {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
  heightClassName?: string;
}

// A literal card flip (like turning over a recipe card) so users can check
// the transcription against the original scan without losing their place.
//
// heightClassName must set an explicit height (not min-height): the faces
// are absolutely positioned at height:100%, and percentage heights don't
// resolve against a parent whose height comes only from min-height.
export function FlipCard({ flipped, front, back, heightClassName = 'h-[420px]' }: FlipCardProps) {
  return (
    <div className={`relative w-full ${heightClassName} [perspective:2000px]`}>
      <div
        className="relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden] overflow-y-auto pr-1">
          {front}
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-hidden rounded-xl bg-slate-100">
          {back}
        </div>
      </div>
    </div>
  );
}
