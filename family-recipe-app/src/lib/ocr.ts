// OCR ingestion for notebook scans: Tesseract.js extracts raw text in the
// browser (no server, works on device), then heuristics split it into a draft
// the Review Drawer lets a human correct before anything is saved. OCR output
// from handwritten cards is expected to be imperfect -- the drawer's whole job
// is that nothing lands in the vault unreviewed.

export interface ParsedRecipeDraft {
  title: string;
  prep_time_min: number | null;
  cook_time_min: number | null;
  base_servings: number | null;
  /** Newline-joined, ready for the editable textarea. */
  ingredients: string;
  instructions: string;
}

// tesseract.js is ~large and only needed on this one path, so it's loaded on
// demand rather than shipped in the main bundle. Language data (eng+fra+tur:
// the languages the family's recipes are actually written in) streams from
// the tessdata CDN on first use and is cached by the browser after that.
export async function extractTextFromImage(
  file: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng+fra+tur', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}

const INGREDIENT_HEADER = /^\s*(ingredients?|ingr[ée]dients?|malzemeler)\s*:?\s*$/i;
const INSTRUCTION_HEADER = /^\s*(instructions?|directions?|method|steps?|pr[ée]paration|haz[ıi]rlan[ıi][şs][ıi]|yap[ıi]l[ıi][şs][ıi]|tarif)\s*:?\s*$/i;

// "1 hr 30 min", "45 min", "1h", "90 minutes", "1 saat" -> minutes.
function parseDurationMinutes(text: string): number | null {
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h(?:ours?|rs?)?\b|heures?|saat)/i);
  const mins = text.match(/(\d+)\s*(?:m(?:in(?:ute)?s?)?\b|dakika|dk)/i);
  if (!hours && !mins) return null;
  const h = hours ? Number(hours[1].replace(',', '.')) : 0;
  const m = mins ? Number(mins[1]) : 0;
  const total = Math.round(h * 60 + m);
  return total > 0 ? total : null;
}

// A line "looks like an ingredient" if it opens with an amount ("2 cups...",
// "½ tsp...", "100g ...") or a list bullet, and stays short. Used only when
// the scan has no explicit section headers.
const QUANTITY_LINE = /^\s*(?:[-•*·]\s*)?[\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/;

export function parseRecipeText(rawText: string): ParsedRecipeDraft {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const draft: ParsedRecipeDraft = {
    title: '',
    prep_time_min: null,
    cook_time_min: null,
    base_servings: null,
    ingredients: '',
    instructions: '',
  };

  const bodyLines: string[] = [];
  for (const line of lines) {
    // Metadata lines are consumed wherever they appear; everything else flows
    // through to section splitting below.
    if (draft.prep_time_min == null && /\b(prep(?:aration)?|haz[ıi]rl[ıi]k)\b/i.test(line)) {
      const t = parseDurationMinutes(line);
      if (t != null) { draft.prep_time_min = t; continue; }
    }
    if (draft.cook_time_min == null && /\b(cook(?:ing)?|bake|baking|cuisson|pi[şs]irme|four|oven)\b/i.test(line)) {
      const t = parseDurationMinutes(line);
      if (t != null) { draft.cook_time_min = t; continue; }
    }
    if (draft.base_servings == null) {
      const m = line.match(/(?:serves|servings?|yield|portions?|pour|ki[şs]ilik)\s*:?\s*(\d+)/i)
        ?? line.match(/(\d+)\s*(?:servings?|portions?|persons?|people|ki[şs]ilik|personnes?)/i);
      if (m) { draft.base_servings = Number(m[1]); continue; }
    }
    bodyLines.push(line);
  }

  // Title: the first body line, unless it's a bare section header.
  if (bodyLines.length > 0 && !INGREDIENT_HEADER.test(bodyLines[0]) && !INSTRUCTION_HEADER.test(bodyLines[0])) {
    draft.title = bodyLines.shift()!.replace(/[:.]+$/, '');
  }

  // Explicit section headers win; otherwise fall back to shape: the leading
  // run of quantity-looking lines is the ingredient list, the rest is method.
  const ingredientLines: string[] = [];
  const instructionLines: string[] = [];
  const ingHeaderIdx = bodyLines.findIndex((l) => INGREDIENT_HEADER.test(l));
  const insHeaderIdx = bodyLines.findIndex((l) => INSTRUCTION_HEADER.test(l));

  if (ingHeaderIdx !== -1 || insHeaderIdx !== -1) {
    let section: 'ingredients' | 'instructions' | 'preamble' = 'preamble';
    for (const line of bodyLines) {
      if (INGREDIENT_HEADER.test(line)) { section = 'ingredients'; continue; }
      if (INSTRUCTION_HEADER.test(line)) { section = 'instructions'; continue; }
      if (section === 'ingredients') ingredientLines.push(line);
      else if (section === 'instructions') instructionLines.push(line);
      else if (QUANTITY_LINE.test(line)) ingredientLines.push(line);
      else instructionLines.push(line);
    }
  } else {
    let inIngredients = true;
    for (const line of bodyLines) {
      if (inIngredients && QUANTITY_LINE.test(line) && line.length <= 64) {
        ingredientLines.push(line);
      } else {
        inIngredients = false;
        instructionLines.push(line);
      }
    }
  }

  draft.ingredients = ingredientLines.map((l) => l.replace(/^[-•*·]\s*/, '')).join('\n');
  draft.instructions = instructionLines.join('\n');
  return draft;
}
