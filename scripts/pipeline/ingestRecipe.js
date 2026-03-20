/**
 * ingestRecipe.js — SpiceStrong Recipe Ingestion Pipeline
 *
 * Orchestrates the full recipe ingestion flow:
 *   1. Accept minimal recipe input (name, ingredients, instructions)
 *   2. Run Claude classification + Edamam nutrition in parallel
 *   3. Merge results into a single row
 *   4. Upsert into the Supabase recipes table
 *
 * Designed to be extended for user-submitted recipes once auth is added.
 * The recipe_source field and submitted_by_user_id are ready for that.
 *
 * @module ingestRecipe
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { classifyRecipe } = require('./classifyRecipe');
const { getNutrition } = require('./getNutrition');
const { generateRecipeFingerprint } = require('../lib/recipeFingerprint');

// ─── Supabase Client ───

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Protein emoji lookup — matches the onboarding script's PROTEINS list.
 */
const PROTEIN_EMOJIS = {
  chicken: '🍗', fish: '🐟', lamb: '🥩', goat: '🐐', pork: '🥩',
  beef: '🥩', prawns: '🦐', eggs: '🥚', paneer: '🧀', tofu: '🟫',
  soy: '🫘', beans: '🫘', milk: '🥛', whey: '🏋️',
};

/**
 * Generates a URL-safe recipe ID from the name.
 *
 * @param {string} name - Recipe name
 * @returns {string} Kebab-case ID prefixed with "native-"
 */
function generateRecipeId(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `native-${slug}`;
}

/**
 * Input payload shape for recipe ingestion.
 *
 * @typedef {Object} RecipePayload
 * @property {string} name - Recipe name (e.g. "Pepper Chicken")
 * @property {string} protein_type - Primary protein (e.g. "chicken")
 * @property {string} serving_size - Human-readable (e.g. "1 bowl (~350g)")
 * @property {number} servings - Number of servings the recipe makes
 * @property {string[]} ingredients - Array of ingredient strings with quantities
 * @property {string[]} instructions - Array of ordered instruction strings
 */

/**
 * Ingestion result returned after successful pipeline run.
 *
 * @typedef {Object} IngestionResult
 * @property {boolean} success - Whether the recipe was inserted/updated
 * @property {boolean} [duplicate] - Whether a fingerprint duplicate was detected
 * @property {string} [id] - The recipe ID in Supabase
 * @property {Object} [recipe] - The full merged recipe object
 * @property {string} [message] - Error or info message
 */

/**
 * Runs the full recipe ingestion pipeline.
 *
 * Flow:
 *   1. Validate input payload
 *   2. Generate fingerprint and check for duplicates
 *   3. Run classification (Claude) + nutrition (Edamam) in parallel
 *   4. Merge all results into a single Supabase row
 *   5. Upsert into the recipes table (is_published = false)
 *
 * @param {RecipePayload} payload - Minimal recipe input
 * @param {Object} [options] - Optional settings
 * @param {string} [options.recipe_source='native'] - Recipe source
 * @param {string} [options.submitted_by_user_id=null] - Future: user ID
 * @param {boolean} [options.force=false] - Skip fingerprint dedup check
 * @returns {Promise<IngestionResult>}
 *
 * @example
 * const result = await ingestRecipe({
 *   name: "Pepper Chicken",
 *   protein_type: "chicken",
 *   serving_size: "1 bowl (~350g)",
 *   servings: 2,
 *   ingredients: ["400g chicken breast", "2 tsp black pepper"],
 *   instructions: ["Heat oil", "Cook chicken"]
 * });
 */
async function ingestRecipe(payload, options = {}) {
  const {
    recipe_source = 'native',
    submitted_by_user_id = null,
    force = false,
  } = options;

  // ─── Step 0: Validate input ───
  const { name, protein_type, serving_size, servings, ingredients, instructions } = payload;

  if (!name) throw new Error('[ingestRecipe] Missing recipe name');
  if (!ingredients || ingredients.length === 0) throw new Error('[ingestRecipe] Missing ingredients');
  if (!instructions || instructions.length === 0) throw new Error('[ingestRecipe] Missing instructions');
  if (!servings || servings < 1) throw new Error('[ingestRecipe] Servings must be >= 1');

  console.log('\n══════════════════════════════════════════');
  console.log(`  INGESTING: ${name}`);
  console.log('══════════════════════════════════════════\n');

  // ─── Step 1: Fingerprint dedup check ───
  const recipeForFp = {
    ingredients: ingredients.map(ing => ({ name: ing })),
    steps: instructions.map(inst => ({ description: inst })),
  };
  const fingerprint = generateRecipeFingerprint(recipeForFp);
  console.log(`[pipeline] Fingerprint: ${fingerprint.substring(0, 16)}...`);

  if (!force) {
    const { data: existing } = await supabase
      .from('recipes')
      .select('id, name')
      .eq('fingerprint', fingerprint)
      .maybeSingle();

    if (existing) {
      console.log(`[pipeline] DUPLICATE — matches: ${existing.name} (${existing.id})`);
      return {
        success: false,
        duplicate: true,
        message: `Duplicate of "${existing.name}" (${existing.id})`,
      };
    }
  }

  // ─── Step 2: Run classification + nutrition in parallel ───
  console.log('[pipeline] Running Claude classification + Edamam nutrition in parallel...\n');

  let classification, nutrition;
  try {
    [classification, nutrition] = await Promise.all([
      classifyRecipe(name, ingredients, instructions),
      getNutrition(ingredients, servings),
    ]);
  } catch (err) {
    // If one fails, try them individually so we get partial results
    console.warn(`[pipeline] Parallel execution failed: ${err.message}`);
    console.log('[pipeline] Retrying individually...\n');

    try {
      classification = await classifyRecipe(name, ingredients, instructions);
    } catch (classErr) {
      console.error(`[pipeline] Classification failed: ${classErr.message}`);
      classification = null;
    }

    try {
      nutrition = await getNutrition(ingredients, servings);
    } catch (nutrErr) {
      console.error(`[pipeline] Nutrition analysis failed: ${nutrErr.message}`);
      nutrition = null;
    }
  }

  // ─── Step 3: Merge into Supabase row ───
  const recipeId = generateRecipeId(name);

  const recipeRow = {
    // Identity
    id: recipeId,
    name,
    protein_id: protein_type,
    protein_name: protein_type.charAt(0).toUpperCase() + protein_type.slice(1),
    protein_emoji: PROTEIN_EMOJIS[protein_type.toLowerCase()] || '🍽️',
    serving_size,
    ingredients: ingredients,      // stored as JSONB string array
    steps: instructions.map((inst, i) => ({
      title: `Step ${i + 1}`,
      description: inst,
    })),

    // Source & metadata
    recipe_source,
    source: recipe_source === 'native' ? 'curated' : 'ai',
    is_published: false,
    is_ai_generated: false,
    is_active: true,
    fingerprint,

    // Classification (from Claude)
    // Map Claude's difficulty values to DB CHECK constraint values
    ...(classification && {
      cuisine_type: classification.cuisine_type,
      spice_level: classification.spice_level,
      difficulty: ({ 'Beginner': 'Easy', 'Intermediate': 'Medium', 'Advanced': 'Hard', 'Chef level': 'Hard' }[classification.difficulty] || classification.difficulty),
      cook_time_bucket: classification.cook_time_bucket,
      meal_type_tags: classification.meal_type,
      dietary_tags: classification.dietary_tags,
      allergen_tags: classification.allergen_tags,
      cooking_method: classification.cooking_method,
      fitness_goal: classification.fitness_goal,
      storage_tags: classification.storage_tags,
    }),

    // Nutrition (from Edamam)
    ...(nutrition && {
      calories: nutrition.calories,
      protein_g: nutrition.protein_g,
      carbs_g: nutrition.carbs_g,
      fat_g: nutrition.fat_g,
      fiber_g: nutrition.fiber_g,
    }),

  };

  // ─── Step 4: Log the merged object ───
  console.log('\n──────────────────────────────────────────');
  console.log('  MERGED RECIPE OBJECT');
  console.log('──────────────────────────────────────────');
  console.log(JSON.stringify(recipeRow, null, 2));
  console.log('──────────────────────────────────────────\n');

  // ─── Step 5: Upsert into Supabase ───
  try {
    console.log('[pipeline] Upserting into Supabase...');

    const { error } = await supabase
      .from('recipes')
      .upsert(recipeRow, { onConflict: 'id' });

    if (error) {
      // If new columns don't exist yet, strip them and retry with core fields only
      if (error.message.includes('schema cache') || error.message.includes('column')) {
        console.warn(`[pipeline] Schema mismatch (${error.message}) — retrying without problematic columns`);

        // Remove columns that might not exist and retry
        const safeRow = { ...recipeRow };
        const optionalColumns = [
          'cuisine_type', 'cook_time_bucket', 'meal_type_tags', 'dietary_tags',
          'allergen_tags', 'cooking_method', 'fitness_goal', 'storage_tags',
          'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g',
          'community_rating', 'review_count', 'is_ai_generated', 'is_published',
          'serving_size', 'recipe_source',
        ];
        for (const col of optionalColumns) delete safeRow[col];
        delete safeRow.updated_at;

        const { error: retryError } = await supabase
          .from('recipes')
          .upsert(safeRow, { onConflict: 'id' });

        if (retryError) {
          throw new Error(`Supabase insert failed (retry): ${retryError.message}`);
        }

        console.warn('[pipeline] Inserted with core fields only — run the classification migration to enable all columns');
      } else if (error.code === '23505' && error.message.includes('fingerprint')) {
        console.log('[pipeline] Fingerprint collision at DB level — duplicate detected');
        return {
          success: false,
          duplicate: true,
          message: 'Duplicate recipe detected at database level',
        };
      } else {
        throw new Error(`Supabase insert failed: ${error.message}`);
      }
    }

    console.log(`[pipeline] SUCCESS — Recipe "${name}" ingested as ${recipeId}\n`);

    return {
      success: true,
      id: recipeId,
      recipe: recipeRow,
    };
  } catch (err) {
    console.error(`[pipeline] FAILED: ${err.message}`);
    throw err;
  }
}

module.exports = { ingestRecipe, generateRecipeId };
