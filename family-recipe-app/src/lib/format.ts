// Legacy imported recipes store each ingredient as a structured object
// (e.g. { raw: "100g almonds", item: "almonds", unit: "g", quantity: 100, ... })
// while recipes added through the app store plain strings. This normalizes
// either shape into the single human-readable line a person actually wrote.
export function formatIngredient(ing: unknown): string {
  if (typeof ing === 'string') return ing;

  if (ing && typeof ing === 'object') {
    const o = ing as Record<string, unknown>;

    if (typeof o.raw === 'string' && o.raw.trim()) return o.raw;

    // No raw text to fall back on — reconstruct a readable line from the parts.
    const quantity = o.quantity_max != null ? `${o.quantity ?? ''}-${o.quantity_max}` : o.quantity;
    const parts = [quantity, o.unit, o.item].filter((p) => p !== null && p !== undefined && p !== '');
    let text = parts.join(' ').trim();
    if (o.note) text += ` (${o.note})`;
    return text || 'Unspecified ingredient';
  }

  return String(ing);
}

export function formatIngredientList(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map(formatIngredient);
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
