#!/usr/bin/env node
/**
 * backfill-fingerprints.js — SpiceStrong
 *
 * Generates and sets SHA-256 fingerprints for all existing recipes
 * in Supabase that don't have one yet.
 *
 * Safe to run multiple times — only updates rows with NULL fingerprint.
 *
 * Usage: node scripts/backfill-fingerprints.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { generateRecipeFingerprint, getFingerprintInput } = require('./lib/recipeFingerprint');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('SpiceStrong — Backfill Recipe Fingerprints');
  console.log('==========================================\n');

  // Fetch all recipes without a fingerprint
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, name, ingredients, steps')
    .is('fingerprint', null);

  if (error) {
    console.error('Failed to fetch recipes:', error.message);
    process.exit(1);
  }

  if (!recipes || recipes.length === 0) {
    console.log('All recipes already have fingerprints. Nothing to do.');
    return;
  }

  console.log(`Found ${recipes.length} recipe(s) without fingerprints:\n`);

  let updated = 0;
  let skipped = 0;

  for (const recipe of recipes) {
    const fp = generateRecipeFingerprint({
      ingredients: recipe.ingredients,
      steps: recipe.steps,
    });
    const fpInput = getFingerprintInput({
      ingredients: recipe.ingredients,
      steps: recipe.steps,
    });

    console.log(`  ${recipe.name}`);
    console.log(`    ID:          ${recipe.id}`);
    console.log(`    Fingerprint: ${fp.substring(0, 16)}...`);
    console.log(`    Input:       ${fpInput.substring(0, 60)}${fpInput.length > 60 ? '...' : ''}`);

    // Check if another recipe already has this fingerprint (duplicate in DB)
    const { data: existing } = await supabase
      .from('recipes')
      .select('id, name')
      .eq('fingerprint', fp)
      .maybeSingle();

    if (existing) {
      console.log(`    DUPLICATE of: ${existing.name} (${existing.id}) — skipping\n`);
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('recipes')
      .update({ fingerprint: fp })
      .eq('id', recipe.id);

    if (updateError) {
      console.log(`    ERROR: ${updateError.message}\n`);
      skipped++;
    } else {
      console.log(`    Updated!\n`);
      updated++;
    }
  }

  console.log(`\n==========================================`);
  console.log(`Backfill complete`);
  console.log(`==========================================`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Total:    ${recipes.length}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
