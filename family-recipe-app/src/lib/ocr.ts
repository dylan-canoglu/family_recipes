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

export const OCR_LANGUAGES = [
  { code: 'fra', label: 'French' },
  { code: 'tur', label: 'Turkish' },
  { code: 'eng', label: 'English' },
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number]['code'];

export interface OcrResult {
  text: string;
  /**
   * Tesseract's mean confidence, 0-100. Treat as a weak hint only: measured
   * against the vault's own scans, a run that returned ZERO characters
   * reported 95, while the most legible run of the batch reported 38.
   * Confidence describes how sure Tesseract is of the shapes it committed
   * to, not whether the words are right. Never pick a "best" result by it.
   */
  confidence: number;
}

export interface OcrOptions {
  /**
   * One language, not several. The original 'eng+fra+tur' let the Turkish
   * model bleed into French pages -- "CRÈME DE POIREAUX" came back as
   * "POİREAUX" with a Turkish dotted capital I, and "GARNI" as "GARNT".
   * Tesseract splits its character-shape budget across every language
   * loaded, so each extra one costs accuracy on the others.
   */
  language?: OcrLanguage;
  onProgress?: (pct: number) => void;
}

// Tesseract expects roughly 300dpi. A phone photo of a notebook page is
// nowhere near that once it lands as a ~1100px JPEG, and undersized text is
// the single biggest cause of garbage output.
const OCR_TARGET_WIDTH = 2200;

/**
 * Upscale, flatten to grayscale, then threshold to pure black and white.
 *
 * This is the highest-value step in the whole pipeline. Measured on the
 * vault's own scans: a printed page went from "ET AU BOUQUET GARNT" to the
 * correct "ET AU BOUQUET GARNI", and a handwritten line whose truth is
 * "3 pots sucre" went from "2 sucre om" to "3 pot sucre".
 *
 * Otsu picks the threshold from the image's own histogram rather than a
 * fixed cutoff, which is what makes it survive the uneven lighting and
 * glare in photos taken over a glossy page.
 */
export async function preprocessForOcr(file: File | Blob): Promise<Blob> {
  try {
    // from-image applies the EXIF rotation, so pages photographed sideways
    // are upright before Tesseract ever looks for a baseline.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.max(1, OCR_TARGET_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < px.length; i += 4) {
      // Rec. 601 luma -- ink on cream paper separates better than a flat mean.
      const grey = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = px[i + 1] = px[i + 2] = grey;
      histogram[grey]++;
    }

    // Otsu: the cutoff maximising between-class variance.
    const total = canvas.width * canvas.height;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumBelow = 0;
    let weightBelow = 0;
    let bestVariance = 0;
    let threshold = 128;
    for (let t = 0; t < 256; t++) {
      weightBelow += histogram[t];
      if (weightBelow === 0) continue;
      const weightAbove = total - weightBelow;
      if (weightAbove === 0) break;
      sumBelow += t * histogram[t];
      const meanBelow = sumBelow / weightBelow;
      const meanAbove = (sum - sumBelow) / weightAbove;
      const variance = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2;
      if (variance > bestVariance) {
        bestVariance = variance;
        threshold = t;
      }
    }

    for (let i = 0; i < px.length; i += 4) {
      const value = px[i] > threshold ? 255 : 0;
      px[i] = px[i + 1] = px[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);

    // PNG, not JPEG: JPEG would reintroduce ringing around the very edges
    // the threshold just sharpened.
    const processed = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    return processed ?? file;
  } catch {
    // Anything unsupported (an HEIC the browser cannot decode, a canvas that
    // failed to allocate) falls back to the untouched file -- worse OCR beats
    // no OCR.
    return file;
  }
}

// tesseract.js is ~large and only needed on this one path, so it's loaded on
// demand rather than shipped in the main bundle. Language data streams from
// the tessdata CDN on first use and is cached by the browser after that.
export async function extractTextFromImage(
  file: File | Blob,
  { language = 'fra', onProgress }: OcrOptions = {},
): Promise<OcrResult> {
  const prepared = await preprocessForOcr(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(language, 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    // Page segmentation is left at Tesseract's default on purpose. PSM 4 and
    // 6 were both measured against these scans: 6 changed nothing, and 4
    // returned an empty string on the handwritten page while reporting 95
    // confidence.
    const { data } = await worker.recognize(prepared);
    return { text: data.text ?? '', confidence: Math.round(data.confidence ?? 0) };
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

// "1. Mix the flour", "2) Add the eggs" -- a numbered METHOD step, which also
// opens with a digit and would otherwise be mistaken for an ingredient.
const STEP_LINE = /^\s*\d{1,2}\s*[.)]\s+\p{L}/u;

// Ingredient lines are short; anything longer is a sentence.
const INGREDIENT_MAX_LEN = 64;

// OCR on a difficult page returns things like "FE pi, =" or "[|". Pre-filling
// the title with that is worse than leaving it blank, because it looks like a
// real value and gets saved unnoticed.
function looksLikeWords(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return text.length >= 3 && letters / text.length >= 0.6;
}

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

  // Title: the first body line, unless it's a bare section header -- and only
  // if it reads as words. A blank title the user fills in beats a plausible
  // looking "FE pi, =" that gets saved without anyone noticing.
  if (bodyLines.length > 0 && !INGREDIENT_HEADER.test(bodyLines[0]) && !INSTRUCTION_HEADER.test(bodyLines[0])) {
    const candidate = bodyLines[0].replace(/[:.]+$/, '');
    if (looksLikeWords(candidate)) {
      draft.title = candidate;
      bodyLines.shift();
    }
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
    // Shape-based fallback. This used to be a single sticky run: the first
    // line that did not look like a quantity flipped `inIngredients` false
    // forever. One page number, smudge or OCR artefact above the list was
    // enough to send every ingredient into the instructions box -- measured
    // on the vault's own scans, all three test pages parsed to zero
    // ingredient lines despite yielding 380-800 characters of text.
    //
    // Now each line is judged on its own shape, and only a genuine run of
    // prose closes the ingredient list. Short junk lines are filed under
    // instructions without ending ingredient collection.
    let methodStarted = false;
    let proseRun = 0;
    for (const line of bodyLines) {
      const isProse = line.length > INGREDIENT_MAX_LEN || STEP_LINE.test(line);
      if (!methodStarted && QUANTITY_LINE.test(line) && !isProse) {
        ingredientLines.push(line);
        proseRun = 0;
        continue;
      }
      instructionLines.push(line);
      // Two consecutive prose lines mean the method has begun; after that a
      // "3 eggs" inside a step should not be lifted out into the shopping list.
      if (isProse) {
        proseRun += 1;
        if (proseRun >= 2) methodStarted = true;
      }
    }
  }

  draft.ingredients = ingredientLines.map((l) => l.replace(/^[-•*·]\s*/, '')).join('\n');
  draft.instructions = instructionLines.join('\n');
  return draft;
}
