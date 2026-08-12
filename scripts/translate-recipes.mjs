#!/usr/bin/env node
/**
 * Translate the vault's recipe text and store it in recipe_translations.
 *
 * Run from a laptop, never from the browser. Both keys used here are secrets:
 * the Supabase service role key bypasses RLS, and the Anthropic key is
 * billable. Neither can live in the app bundle, which is precisely why
 * translation happens here, once, instead of at render time.
 *
 *   1. Run family-recipe-app/supabase-recipe-translations.sql in the SQL editor.
 *   2. Add ANTHROPIC_API_KEY to the repo-root .env, next to the SUPABASE_URL
 *      and SUPABASE_SERVICE_ROLE_KEY already there. That file is gitignored.
 *   3. npm install          (from the repo root, once)
 *   4. npm run translate -- --lang fr --limit 5
 *
 * Flags:
 *   --lang <en|fr|tr>   target language (required)
 *   --limit <n>         stop after n recipes, for a cheap trial run
 *   --force             retranslate recipes that already have a row
 *   --dry-run           translate nothing, just report what would be done
 *
 * Safe to re-run: it skips recipes that already have a translation unless
 * --force is passed, so an interrupted run resumes where it stopped.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Resolved from this file, not from the working directory: the .env lives at
// the repo root and the script should work no matter where it is invoked.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env') });

const LANG_NAMES = { en: 'English', fr: 'French', tr: 'Turkish' };

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const lang = flag('lang');
const limit = Number(flag('limit', 0)) || 0;
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

if (!LANG_NAMES[lang]) {
  console.error('Usage: node scripts/translate-recipes.mjs --lang <en|fr|tr> [--limit n] [--force] [--dry-run]');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY && !dryRun) {
  console.error('Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Ingredients arrive either as plain strings or as the structured objects the
// original import produced. Only the human-readable line needs translating.
const ingredientLines = (ingredients) => {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .map((ing) => {
      if (typeof ing === 'string') return ing;
      if (ing && typeof ing === 'object') {
        if (typeof ing.raw === 'string' && ing.raw.trim()) return ing.raw;
        return [ing.quantity, ing.unit, ing.item].filter(Boolean).join(' ');
      }
      return '';
    })
    .filter((line) => line.trim() !== '');
};

const SYSTEM = `You translate family recipes. Rules:
- Translate into {TARGET}. If a passage is already in {TARGET}, leave it as it is.
- Keep every quantity, unit and number EXACTLY as written. Do not convert
  grams to ounces, do not round, do not recompute anything.
- Keep dish names that are proper nouns (Köfte, Karnıyarık, Pâte Brisée) in
  their original form; you may add a short gloss in parentheses on the title.
- Preserve line structure: one ingredient per line, in the same order.
- Keep the register plain and practical, the way a cook writes for family.
- Return ONLY valid JSON matching the requested shape. No commentary.`;

async function translateRecipe(recipe) {
  const lines = ingredientLines(recipe.ingredients);
  const payload = {
    title: recipe.title ?? '',
    ingredients: lines,
    instructions: recipe.instructions ?? '',
    notes: recipe.notes ?? '',
  };

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system: SYSTEM.replaceAll('{TARGET}', LANG_NAMES[lang]),
    messages: [{
      role: 'user',
      content:
        `Translate this recipe into ${LANG_NAMES[lang]}.\n\n` +
        `Return JSON: {"title": string, "ingredients": string[], "instructions": string, "notes": string}\n` +
        `"ingredients" must have exactly ${lines.length} entries, in the same order.\n\n` +
        JSON.stringify(payload, null, 2),
    }],
  });

  const text = message.content.find((block) => block.type === 'text')?.text ?? '';
  // Models sometimes wrap JSON in a fence despite instructions.
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(json);

  // A dropped or invented ingredient line would silently corrupt a recipe,
  // so mismatched counts are rejected rather than stored.
  if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length !== lines.length) {
    throw new Error(`ingredient count ${parsed.ingredients?.length} != ${lines.length}`);
  }
  return parsed;
}

async function main() {
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, ingredients, instructions, notes, visibility')
    .eq('visibility', 'global')
    .is('deleted_at', null);
  if (error) throw error;

  const { data: existing } = await supabase
    .from('recipe_translations')
    .select('recipe_id')
    .eq('lang', lang);
  const done = new Set((existing ?? []).map((row) => row.recipe_id));

  let todo = recipes.filter((r) => force || !done.has(r.id));
  if (limit) todo = todo.slice(0, limit);

  console.log(`${recipes.length} global recipes; ${done.size} already have ${lang}; ${todo.length} to do.`);
  if (dryRun) {
    console.log('Dry run — nothing sent, nothing written.');
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const [i, recipe] of todo.entries()) {
    const label = `[${i + 1}/${todo.length}] ${(recipe.title ?? '').slice(0, 45)}`;
    try {
      const out = await translateRecipe(recipe);
      const { error: writeError } = await supabase.from('recipe_translations').upsert({
        recipe_id: recipe.id,
        lang,
        title: out.title || null,
        ingredients: out.ingredients ?? null,
        instructions: out.instructions || null,
        notes: out.notes || null,
        source: 'machine',
        updated_at: new Date().toISOString(),
      });
      if (writeError) throw writeError;
      ok += 1;
      console.log(`${label} — ok`);
    } catch (err) {
      failed += 1;
      // Keep going: one bad recipe should not end a 200-recipe run, and the
      // skip is recoverable by simply running the script again.
      console.error(`${label} — FAILED: ${err.message}`);
    }
  }

  console.log(`\nDone. ${ok} translated, ${failed} failed.`);
  if (failed) console.log('Re-run to retry the failures; successes are skipped automatically.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
