#!/usr/bin/env node
/**
 * Fill in recipes whose text was never fully transcribed, by re-reading their
 * scanned page with a vision model.
 *
 * 71 of the 203 global recipes have no instructions and 42 have no
 * ingredients, but the pages themselves are sitting in Supabase storage on
 * every one of those rows. Nothing is lost; it just was not typed up.
 *
 * NOTHING IS WRITTEN TO A RECIPE. Each result becomes a pending
 * `edit_global` row in approval_requests, which the Admin screen already
 * renders as a diff and applies on approval. A model misreading a
 * grandmother's handwriting must not silently become the family's recipe.
 *
 *   npm install                    (once, from the repo root)
 *   npm run retranscribe -- --limit 3 --dry-run
 *   npm run retranscribe -- --limit 3
 *   npm run retranscribe
 *
 * Flags:
 *   --limit <n>   stop after n recipes (do a small batch first)
 *   --dry-run     read and report, send nothing, write nothing
 *   --all         include recipes that are merely missing notes
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env') });

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const limit = Number(flag('limit', 0)) || 0;
const dryRun = args.includes('--dry-run');
const includeNotes = args.includes('--all');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the repo-root .env');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY && !dryRun) {
  console.error('Missing ANTHROPIC_API_KEY in the repo-root .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const PLACEHOLDER_TITLE = /^(sub-recipe|right page|left page|page \d|untitled|loose|sticky)/i;
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const missingInstructions = (r) => text(r.instructions).length < 20;
const missingIngredients = (r) => !Array.isArray(r.ingredients) || r.ingredients.length === 0;
const placeholderTitle = (r) => PLACEHOLDER_TITLE.test(text(r.title));

const needsWork = (r) =>
  missingInstructions(r) || missingIngredients(r) || placeholderTitle(r) ||
  (includeNotes && !text(r.notes));

const SYSTEM = `You read photographed pages from a family recipe notebook and
transcribe what is actually written there.

Hard rules:
- Transcribe. Do not invent, complete or improve a recipe. If a step or an
  amount is not legible, leave it out rather than guessing at it.
- Keep the ORIGINAL LANGUAGE of the page. Do not translate anything; a
  separate step handles translation.
- Copy quantities exactly as written, including fractions and abbreviations.
- A page often holds several recipes. Extract ONLY the one you are asked for.
- If the requested recipe is not on the page, or the handwriting cannot be
  read with confidence, say so via "found": false. That is a useful, correct
  answer and is much better than a plausible invention.

Return ONLY valid JSON, no code fences, no commentary.`;

async function imageBlock(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  const media = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return {
    type: 'image',
    source: { type: 'base64', media_type: media, data: buf.toString('base64') },
  };
}

async function transcribe(recipe) {
  const known = {
    title: text(recipe.title),
    has_ingredients: !missingIngredients(recipe),
    has_instructions: !missingInstructions(recipe),
  };

  const ask = placeholderTitle(recipe)
    ? `This recipe row has only a placeholder title ("${known.title}"). Identify the main recipe on this page and transcribe it, including its real title.`
    : `Transcribe the recipe titled "${known.title}" from this page.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        await imageBlock(recipe.image_path),
        {
          type: 'text',
          text:
            `${ask}\n\n` +
            `Return JSON:\n` +
            `{"found": boolean, "confidence": "high"|"medium"|"low", ` +
            `"title": string, "ingredients": string[], "instructions": string, "notes": string}\n\n` +
            `"instructions" should be the method as written, one step per line.\n` +
            `Leave a field as "" or [] if that part is not on the page.`,
        },
      ],
    }],
  });

  const raw = message.content.find((b) => b.type === 'text')?.text ?? '';
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
}

/**
 * Only propose what is actually missing. A recipe that has good ingredients
 * but no method should get a method and keep its ingredients untouched.
 */
function buildChanges(recipe, out) {
  const changes = {};
  if (missingInstructions(recipe) && text(out.instructions)) {
    changes.instructions = text(out.instructions);
  }
  if (missingIngredients(recipe) && Array.isArray(out.ingredients) && out.ingredients.length) {
    changes.ingredients = out.ingredients;
  }
  if (placeholderTitle(recipe) && text(out.title) && !PLACEHOLDER_TITLE.test(text(out.title))) {
    changes.title = text(out.title);
  }
  if (includeNotes && !text(recipe.notes) && text(out.notes)) {
    changes.notes = text(out.notes);
  }
  return changes;
}

async function main() {
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, ingredients, instructions, notes, image_path')
    .eq('visibility', 'global')
    .is('deleted_at', null);
  if (error) throw error;

  // Requests are attributed to the admin, who is the one who reviews them.
  const { data: admins } = await supabase.from('admins').select('email').limit(1);
  const adminEmail = admins?.[0]?.email;
  const { data: userPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const adminUser = userPage?.users?.find((u) => u.email === adminEmail) ?? userPage?.users?.[0];
  if (!adminUser) throw new Error('Could not resolve an admin user to attribute requests to');

  // Never queue a second request for a recipe that already has one waiting.
  const { data: pending } = await supabase
    .from('approval_requests')
    .select('recipe_id')
    .eq('status', 'pending');
  const alreadyQueued = new Set((pending ?? []).map((r) => r.recipe_id));

  const candidates = recipes.filter(needsWork);
  const withScan = candidates.filter((r) => text(r.image_path));
  let todo = withScan.filter((r) => !alreadyQueued.has(r.id));
  if (limit) todo = todo.slice(0, limit);

  console.log(`${recipes.length} global recipes`);
  console.log(`  ${candidates.length} incomplete`);
  console.log(`  ${candidates.length - withScan.length} of those have no scan to read (skipped)`);
  console.log(`  ${alreadyQueued.size} already awaiting review`);
  console.log(`  ${todo.length} to transcribe now\n`);
  console.log(`Requests will be attributed to ${adminUser.email} and appear in Admin > pending.\n`);

  if (dryRun) {
    for (const r of todo.slice(0, 15)) {
      const gaps = [
        missingInstructions(r) && 'instructions',
        missingIngredients(r) && 'ingredients',
        placeholderTitle(r) && 'title',
      ].filter(Boolean).join(', ');
      console.log(`  ${(text(r.title) || '(untitled)').slice(0, 45).padEnd(46)} missing: ${gaps}`);
    }
    console.log('\nDry run — nothing sent, nothing written.');
    return;
  }

  let queued = 0, notFound = 0, failed = 0;
  for (const [i, recipe] of todo.entries()) {
    const label = `[${i + 1}/${todo.length}] ${(text(recipe.title) || '(untitled)').slice(0, 42)}`;
    try {
      const out = await transcribe(recipe);
      if (!out.found) {
        notFound += 1;
        console.log(`${label} — not legible on the page, skipped`);
        continue;
      }
      const changes = buildChanges(recipe, out);
      if (Object.keys(changes).length === 0) {
        notFound += 1;
        console.log(`${label} — nothing new to add, skipped`);
        continue;
      }
      const { error: writeError } = await supabase.from('approval_requests').insert({
        id: randomUUID(),
        recipe_id: recipe.id,
        requested_by: adminUser.id,
        request_type: 'edit_global',
        proposed_changes: changes,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      if (writeError) throw writeError;
      queued += 1;
      console.log(`${label} — queued (${Object.keys(changes).join(', ')}, confidence: ${out.confidence ?? '?'})`);
    } catch (err) {
      failed += 1;
      console.error(`${label} — FAILED: ${err.message}`);
    }
  }

  console.log(`\n${queued} queued for review, ${notFound} skipped, ${failed} failed.`);
  if (queued) console.log('Open Admin in the app to review and approve them.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
