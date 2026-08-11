import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  // Omit to render a read-only rating (used in history lists and Discovery).
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' };

export function StarRating({ value, onChange, size = 'md' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const readOnly = !onChange;
  const shown = hovered || value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHovered(star)}
          title={readOnly ? undefined : `${star} star${star > 1 ? 's' : ''}`}
          className={readOnly ? 'cursor-default' : 'transition-transform hover:scale-110'}
        >
          <Star
            className={`${SIZES[size]} ${
              star <= shown ? 'text-amber-400 fill-current' : 'text-slate-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
