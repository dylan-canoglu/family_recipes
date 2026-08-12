// --- Quantity parsing & scaling -------------------------------------------
// The vault mixes hand-typed lines ("2 cups flour"), European decimals
// ("2,5 dl süt"), unicode fractions ("½ tsp"), mixed numbers ("1 1/2 cups")
// and ranges ("2-3 eggs"). The portion scaler multiplies all of them without
// touching lines that carry no quantity at all ("Salt", "Zest of one lemon").

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};
const FRACTION_CLASS = Object.keys(UNICODE_FRACTIONS).join('');

// One numeric token: "2", "2.5", "2,5", "1/2", "1 1/2", "½", "1½".
// Order is load-bearing: alternation is first-match-wins, so the compound
// forms must come before bare `\d+`. Listing the plain integer first made
// "1/2 tsp" match just "1" and leave "/2" stranded in the ingredient name.
const NUM_PART = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?\s*[${FRACTION_CLASS}]|\d+(?:[.,]\d+)?|[${FRACTION_CLASS}])`;
// Only a quantity at the START of the line is scaled. Numbers elsewhere are
// too often not amounts ("see note 2", "type 00 flour") to touch safely.
const LEADING_QTY_RE = new RegExp(String.raw`^(${NUM_PART})(?:\s*(?:-|–|—|\bto\b|\bà\b)\s*(${NUM_PART}))?`, 'iu');

export function parseQuantityToken(raw: string): number | null {
  const token = raw.trim();
  const withGlyph = token.match(new RegExp(String.raw`^(\d+(?:[.,]\d+)?)?\s*([${FRACTION_CLASS}])$`, 'u'));
  if (withGlyph) return (withGlyph[1] ? Number(withGlyph[1].replace(',', '.')) : 0) + UNICODE_FRACTIONS[withGlyph[2]];
  const mixed = token.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = token.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  const n = Number(token.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Renders scaled amounts the way a cook writes them: "1½", not "1.5000000001".
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.02 || frac > 0.98) return String(Math.round(value));
  for (const [glyph, f] of Object.entries(UNICODE_FRACTIONS)) {
    if (Math.abs(frac - f) < 0.02) return whole > 0 ? `${whole}${glyph}` : glyph;
  }
  return String(Math.round(value * 100) / 100);
}

// Splits a formatted ingredient line into its leading amount and the rest.
// Ranges collapse to their lower bound -- good enough for a shopping list.
export function splitLeadingQuantity(text: string): { quantity: number | null; rest: string } {
  const match = text.match(LEADING_QTY_RE);
  if (!match || !match[0].trim()) return { quantity: null, rest: text.trim() };
  const quantity = parseQuantityToken(match[1]);
  if (quantity == null) return { quantity: null, rest: text.trim() };
  return { quantity, rest: text.slice(match[0].length).trim() };
}

// A parenthetical restating the amount in another unit, e.g. the "(3/4 dl)"
// in "75ml (3/4 dl) water". Deliberately narrow -- the whole parenthetical
// must be a quantity followed by a single short word -- so prose like
// "(see note 3)" or "(chopped)" is never touched.
const EQUIVALENT_PAREN_RE = new RegExp(String.raw`\((${NUM_PART})\s*(\p{L}{1,12})\)`, 'u');
// Same shape, unwrapped: structured ingredients keep it in `note` ("3/4 dl")
// and the parentheses are added at render time.
const EQUIVALENT_NOTE_RE = new RegExp(String.raw`^(${NUM_PART})\s*(\p{L}{1,12})$`, 'u');

// Scales a note only when it is purely an amount restated in another unit.
// Descriptive notes ("cold", "finely chopped") pass through untouched.
export function scaleEquivalentNote(note: string, multiplier: number): string {
  if (multiplier === 1) return note;
  const match = note.trim().match(EQUIVALENT_NOTE_RE);
  if (!match) return note;
  const value = parseQuantityToken(match[1]);
  return value == null ? note : `${formatAmount(value * multiplier)} ${match[2]}`;
}

// Scales an in-line "(3/4 dl)"-style restatement wherever it sits. The legacy
// import often left it inside the `item` field itself, so this has to run on
// reconstructed lines as well as raw ones.
export function scaleEquivalentParenthetical(text: string, multiplier: number): string {
  if (multiplier === 1) return text;
  return text.replace(EQUIVALENT_PAREN_RE, (match, qty: string, unit: string) => {
    const value = parseQuantityToken(qty);
    return value == null ? match : `(${formatAmount(value * multiplier)} ${unit})`;
  });
}

// Scales the leading quantity (or quantity range) of a free-text line.
// Lines with no leading quantity come back untouched.
export function scaleQuantityText(text: string, multiplier: number): string {
  if (multiplier === 1) return text;

  let scaledLeading = false;
  const scaled = text.replace(LEADING_QTY_RE, (match, first: string, second: string | undefined) => {
    const a = parseQuantityToken(first);
    if (a == null) return match;
    scaledLeading = true;
    if (second != null) {
      const b = parseQuantityToken(second);
      if (b != null) return `${formatAmount(a * multiplier)}-${formatAmount(b * multiplier)}`;
    }
    return formatAmount(a * multiplier);
  });

  // Only worth doing once the main amount actually changed -- otherwise the
  // parenthetical isn't restating anything we scaled.
  return scaledLeading ? scaleEquivalentParenthetical(scaled, multiplier) : scaled;
}

// Legacy imported recipes store each ingredient as a structured object
// (e.g. { raw: "100g almonds", item: "almonds", unit: "g", quantity: 100, ... })
// while recipes added through the app store plain strings. This normalizes
// either shape into the single human-readable line a person actually wrote,
// scaled by `multiplier` (1 = as written) when the amount is parseable.
export function formatIngredient(ing: unknown, multiplier = 1): string {
  if (typeof ing === 'string') return scaleQuantityText(ing, multiplier);

  if (ing && typeof ing === 'object') {
    const o = ing as Record<string, unknown>;

    const numericQty = typeof o.quantity === 'number' ? o.quantity : null;

    // Prefer the human-written raw line, scaled in place, unless the object
    // carries a numeric quantity we can scale more reliably than regex can.
    if (typeof o.raw === 'string' && o.raw.trim() && (multiplier === 1 || numericQty == null)) {
      return scaleQuantityText(o.raw, multiplier);
    }

    // Reconstruct a readable line from the parts.
    const qty = numericQty != null ? numericQty * multiplier : o.quantity;
    const qtyMax = typeof o.quantity_max === 'number' ? o.quantity_max * multiplier : o.quantity_max;
    const quantity = qtyMax != null
      ? `${typeof qty === 'number' ? formatAmount(qty) : qty ?? ''}-${typeof qtyMax === 'number' ? formatAmount(qtyMax) : qtyMax}`
      : typeof qty === 'number' ? formatAmount(qty) : qty;
    const parts = [quantity, o.unit, o.item].filter((p) => p !== null && p !== undefined && p !== '');
    let text = parts.join(' ').trim();
    // The item text itself can carry a restated amount, e.g. "(3/4 dl) water".
    if (numericQty != null) text = scaleEquivalentParenthetical(text, multiplier);
    if (o.note) text += ` (${scaleEquivalentNote(String(o.note), multiplier)})`;
    if (text) return text;
    // Nothing structured to scale -- fall back to raw as written.
    if (typeof o.raw === 'string' && o.raw.trim()) return scaleQuantityText(o.raw, multiplier);
    return 'Unspecified ingredient';
  }

  return String(ing);
}

export function formatIngredientList(ingredients: unknown, multiplier = 1): string[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map((ing) => formatIngredient(ing, multiplier));
}

const stripLeadingStepNumber = (line: string) => line.replace(/^\s*(?:step\s*)?\d+[.):-]?\s*/i, '').trim();

// Splits free-form instructions text into discrete steps for numbered-list
// display. Prefers existing line breaks (how most manually written recipes
// are formatted); falls back to sentence boundaries for the single-paragraph
// blobs common in the legacy imports, so those still read as steps.
export function formatInstructionSteps(instructions: unknown): string[] {
  if (typeof instructions !== 'string' || !instructions.trim()) return [];

  const lines = instructions
    .split(/\r?\n/)
    .map(stripLeadingStepNumber)
    .filter((l) => l.length > 0);
  if (lines.length > 1) return lines;

  const sentences = instructions
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => stripLeadingStepNumber(s.trim()))
    .filter((s) => s.length > 0);

  return sentences.length > 0 ? sentences : [instructions.trim()];
}
