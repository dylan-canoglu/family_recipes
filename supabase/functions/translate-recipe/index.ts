// Translates one recipe into every supported language, server-side.
//
// This exists because the API key cannot go anywhere near the browser: a key
// in the bundle is a key anyone can read and spend. It runs on Supabase Edge
// Functions, where ANTHROPIC_API_KEY is a secret and the service-role key is
// injected by the platform.
//
// Deploy:
//   supabase functions deploy translate-recipe
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Invoked by the app right after a recipe is created or edited. It is
// fire-and-forget on the client: a failed translation must never block
// someone from saving a family recipe, and scripts/translate-recipes.mjs can
// always backfill whatever was missed.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LANGS = { en: 'English', fr: 'French', tr: 'Turkish' } as const;
type Lang = keyof typeof LANGS;

const SYSTEM = `You translate family recipes into English, French and Turkish.

Rules:
- If a passage is already in the target language, return it unchanged.
- Keep every quantity, unit and number EXACTLY as written. Never convert
  between measurement systems, never round, never recompute.
- Keep proper-noun dish names (Köfte, Karnıyarık, Pâte Brisée) in their
  original form. A short gloss in parentheses on the title is fine.
- Preserve line structure: one ingredient per line, same order, same count.
- Plain practical register, the way a cook writes for their family.
- Return ONLY valid JSON. No commentary, no code fences.`;

interface Ingredient {
  raw?: string;
  item?: string;
  unit?: string;
  quantity?: number | string;
}

/** The legacy import stored objects; app-added recipes store strings. */
function ingredientLines(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .map((ing: unknown) => {
      if (typeof ing === 'string') return ing;
      if (ing && typeof ing === 'object') {
        const o = ing as Ingredient;
        if (typeof o.raw === 'string' && o.raw.trim()) return o.raw;
        return [o.quantity, o.unit, o.item].filter(Boolean).join(' ');
      }
      return '';
    })
    .filter((line) => line.trim() !== '');
}

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { recipe_id } = await req.json();
    if (!recipe_id) {
      return new Response(JSON.stringify({ error: 'recipe_id required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set');

    // Service role: this needs to write recipe_translations, which no browser
    // role is allowed to touch.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: recipe, error: readError } = await supabase
      .from('recipes')
      .select('id, title, ingredients, instructions, notes')
      .eq('id', recipe_id)
      .single();
    if (readError) throw readError;

    const lines = ingredientLines(recipe.ingredients);

    // One call for all three languages: cheaper and faster than three, and the
    // model sees the whole recipe once.
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8192,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content:
            `Translate this recipe into all three languages.\n\n` +
            `Return JSON shaped exactly:\n` +
            `{"en":{"title":string,"ingredients":string[],"instructions":string,"notes":string},` +
            `"fr":{...same...},"tr":{...same...}}\n\n` +
            `Every "ingredients" array must have exactly ${lines.length} entries, same order.\n\n` +
            JSON.stringify({
              title: recipe.title ?? '',
              ingredients: lines,
              instructions: recipe.instructions ?? '',
              notes: recipe.notes ?? '',
            }, null, 2),
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }

    const body = await response.json();
    const raw = body.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());

    const rows = [];
    const skipped: string[] = [];
    for (const lang of Object.keys(LANGS) as Lang[]) {
      const out = parsed[lang];
      if (!out) { skipped.push(lang); continue; }
      // A dropped or invented ingredient line silently corrupts a recipe, so
      // a mismatched count is discarded rather than stored.
      if (!Array.isArray(out.ingredients) || out.ingredients.length !== lines.length) {
        skipped.push(`${lang} (ingredient count)`);
        continue;
      }
      rows.push({
        recipe_id,
        lang,
        title: out.title || null,
        ingredients: out.ingredients,
        instructions: out.instructions || null,
        notes: out.notes || null,
        source: 'machine',
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      // Upsert, so re-running after an edit replaces the stale text rather
      // than leaving a translation that no longer matches the recipe.
      const { error: writeError } = await supabase
        .from('recipe_translations')
        .upsert(rows, { onConflict: 'recipe_id,lang' });
      if (writeError) throw writeError;
    }

    return new Response(JSON.stringify({ translated: rows.map((r) => r.lang), skipped }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('translate-recipe failed:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
