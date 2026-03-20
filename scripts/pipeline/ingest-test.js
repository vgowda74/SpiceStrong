#!/usr/bin/env node
/**
 * ingest-test.js — SpiceStrong Recipe Ingestion Pipeline Test
 *
 * Tests the full ingestion pipeline with a sample Pepper Chicken recipe.
 * Runs Claude classification + Edamam nutrition + Supabase upsert.
 *
 * Usage: node scripts/pipeline/ingest-test.js
 *
 * Options:
 *   --dry-run    Run classification + nutrition but skip Supabase insert
 *   --force      Skip fingerprint dedup check
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { ingestRecipe } = require('./ingestRecipe');

// ─── Sample Recipe: Pepper Chicken ───

const pepperChicken = {
  name: 'Pepper Chicken',
  protein_type: 'chicken',
  serving_size: '1 bowl (~350g)',
  servings: 2,
  ingredients: [
    '400g chicken breast',
    '2 tsp black pepper',
    '1 tbsp olive oil',
    '1 medium onion sliced',
    '3 garlic cloves minced',
    '1 tsp garam masala',
    'salt to taste',
    'fresh coriander for garnish',
  ],
  instructions: [
    'Heat olive oil in a pan over medium heat.',
    'Add sliced onion and cook for 5 minutes until golden.',
    'Add garlic and cook 1 minute.',
    'Add chicken breast and sear for 4 minutes each side.',
    'Add black pepper and garam masala, stir well.',
    'Cover and cook on low heat for 10 minutes.',
    'Garnish with coriander and serve.',
  ],
};

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SpiceStrong Recipe Ingestion Pipeline — TEST    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Check for flags
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');

  if (isDryRun) {
    console.log('🔸 DRY RUN mode — will NOT insert into Supabase\n');
  }

  // Validate env vars
  const envChecks = [
    ['ANTHROPIC_API_KEY / EXPO_PUBLIC_ANTHROPIC_KEY', process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_KEY],
    ['EDAMAM_APP_ID', process.env.EDAMAM_APP_ID],
    ['EDAMAM_APP_KEY', process.env.EDAMAM_APP_KEY],
    ['EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ];

  console.log('Environment check:');
  let missingEnv = false;
  for (const [name, value] of envChecks) {
    const status = value ? '✅' : '❌ MISSING';
    console.log(`  ${status} ${name}`);
    if (!value) missingEnv = true;
  }
  console.log();

  if (missingEnv) {
    console.error('ERROR: Missing required environment variables. Add them to .env and retry.');
    process.exit(1);
  }

  // Run the pipeline
  try {
    const result = await ingestRecipe(pepperChicken, { force: isForce });

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  PIPELINE RESULT                                 ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    if (result.duplicate) {
      console.log('⚠️  DUPLICATE DETECTED');
      console.log(`   ${result.message}`);
      console.log('\n   Use --force flag to skip dedup check.');
    } else if (result.success) {
      console.log('✅ RECIPE INGESTED SUCCESSFULLY\n');
      console.log(`   ID:           ${result.id}`);
      console.log(`   Name:         ${result.recipe.name}`);
      console.log(`   Cuisine:      ${result.recipe.cuisine_type || 'N/A'}`);
      console.log(`   Spice:        ${result.recipe.spice_level || 'N/A'}`);
      console.log(`   Difficulty:   ${result.recipe.difficulty || 'N/A'}`);
      console.log(`   Cook time:    ${result.recipe.cook_time_bucket || 'N/A'}`);
      console.log(`   Method:       ${result.recipe.cooking_method || 'N/A'}`);
      console.log(`   Meal types:   ${JSON.stringify(result.recipe.meal_type_tags) || 'N/A'}`);
      console.log(`   Dietary:      ${JSON.stringify(result.recipe.dietary_tags) || 'N/A'}`);
      console.log(`   Allergen tags: ${JSON.stringify(result.recipe.allergen_tags) || 'N/A'}`);
      console.log(`   Fitness:      ${JSON.stringify(result.recipe.fitness_goal) || 'N/A'}`);
      console.log(`   Storage:      ${JSON.stringify(result.recipe.storage_tags) || 'N/A'}`);
      console.log();
      console.log(`   Calories:     ${result.recipe.calories || 'N/A'} kcal/serving`);
      console.log(`   Protein:      ${result.recipe.protein_g || 'N/A'}g/serving`);
      console.log(`   Carbs:        ${result.recipe.carbs_g || 'N/A'}g/serving`);
      console.log(`   Fat:          ${result.recipe.fat_g || 'N/A'}g/serving`);
      console.log(`   Fiber:        ${result.recipe.fiber_g || 'N/A'}g/serving`);
      console.log();
      console.log(`   Published:    ${result.recipe.is_published}`);
      console.log(`   Fingerprint:  ${result.recipe.fingerprint?.substring(0, 16)}...`);
    }

    console.log('\n══════════════════════════════════════════');
    console.log('  TEST COMPLETE');
    console.log('══════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n❌ PIPELINE FAILED:', err.message);
    process.exit(1);
  }
}

main();
