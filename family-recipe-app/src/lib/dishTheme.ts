import {
  UtensilsCrossed, Soup, CakeSlice, Croissant, Droplets, Salad, Sandwich,
  CookingPot, type LucideIcon,
} from 'lucide-react';

// Colour and icon per dish type.
//
// Every badge in the catalog used to be the same orange, which meant the
// colour carried no information -- a grid of 200 cards read as one
// undifferentiated block. Giving each type its own hue makes the vault
// scannable at a glance: you can find the desserts without reading a word.
//
// Tailwind can't build class names at runtime (the scanner only sees literal
// strings), so each entry spells its classes out in full rather than
// interpolating a colour name.

export interface DishTheme {
  icon: LucideIcon;
  /** Soft badge: tinted background, readable text. */
  badge: string;
  /** Icon-only accent for use on white. */
  accent: string;
  /** Tint behind a card's empty thumbnail. */
  wash: string;
}

const THEMES: Record<string, DishTheme> = {
  'Main Dish': {
    icon: UtensilsCrossed,
    badge: 'bg-orange-100 text-orange-800',
    accent: 'text-orange-500',
    wash: 'group-hover:bg-orange-50',
  },
  Soup: {
    icon: Soup,
    badge: 'bg-amber-100 text-amber-800',
    accent: 'text-amber-500',
    wash: 'group-hover:bg-amber-50',
  },
  Dessert: {
    icon: CakeSlice,
    badge: 'bg-pink-100 text-pink-800',
    accent: 'text-pink-500',
    wash: 'group-hover:bg-pink-50',
  },
  Pastry: {
    icon: Croissant,
    badge: 'bg-violet-100 text-violet-800',
    accent: 'text-violet-500',
    wash: 'group-hover:bg-violet-50',
  },
  Sauce: {
    icon: Droplets,
    badge: 'bg-teal-100 text-teal-800',
    accent: 'text-teal-500',
    wash: 'group-hover:bg-teal-50',
  },
  Side: {
    icon: Salad,
    badge: 'bg-emerald-100 text-emerald-800',
    accent: 'text-emerald-500',
    wash: 'group-hover:bg-emerald-50',
  },
  Appetizer: {
    icon: Sandwich,
    badge: 'bg-sky-100 text-sky-800',
    accent: 'text-sky-500',
    wash: 'group-hover:bg-sky-50',
  },
};

const UNCATEGORIZED: DishTheme = {
  icon: CookingPot,
  badge: 'bg-slate-100 text-slate-600',
  accent: 'text-slate-400',
  wash: 'group-hover:bg-slate-100',
};

export function dishTheme(dishType: string | null | undefined): DishTheme {
  return (dishType && THEMES[dishType]) || UNCATEGORIZED;
}

// Difficulty reads as a scale, so it keeps a single green-amber-rose ramp
// rather than joining the dish-type palette. Rose rather than red: "Hard" is
// a heads-up about effort, not an error state.
export function complexityBadge(complexity: string | null | undefined): string {
  switch (complexity) {
    case 'Easy':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-100';
    case 'Hard':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-100';
    default:
      return 'bg-slate-50 text-slate-500 ring-1 ring-slate-100';
  }
}
