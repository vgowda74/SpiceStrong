#!/usr/bin/env node
/**
 * audit-recipes.js — Audits ALL existing recipes in Supabase against
 * SpiceBuilder quality criteria. Deactivates recipes that fail.
 *
 * Usage:
 *   node scripts/audit-recipes.js              # Dry run (report only)
 *   node scripts/audit-recipes.js --delete     # Deactivate failing recipes
 *
 * Run from project root: cd C:\Users\v_gow\SpiceStrong
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const isDryRun = !process.argv.includes('--delete');

// ════════════════════════════════════════
// VALIDATION RULES (mirrors recipeReviewService.ts)
// ════════════════════════════════════════

const BANNED_PHRASES = /\b(to taste|some|a handful|as needed|a pinch|few|adjust|optional|roughly|about|approximately)\b/i;

function validateRecipe(recipe) {
  const issues = [];
  const warnings = [];

  // Parse ingredients
  let ingredients = [];
  let ingredientsLarge = [];
  try {
    const ingData = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients;
    if (Array.isArray(ingData)) {
      // Flat array format (pipeline recipes)
      ingredients = ingData.map(i => typeof i === 'string' ? { name: i, quantity: '' } : i);
    } else if (ingData && typeof ingData === 'object') {
      // Tiered format
      ingredients = ingData['2-3 servings'] || [];
      ingredientsLarge = ingData['4-6 servings'] || [];
    }
  } catch { /* skip */ }

  // Parse steps
  let steps = [];
  try {
    steps = typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : (recipe.steps || []);
  } catch { /* skip */ }

  // Parse nutrition
  let nutrition = null;
  try {
    const aiNut = typeof recipe.ai_nutrition === 'string' ? JSON.parse(recipe.ai_nutrition) : recipe.ai_nutrition;
    const regNut = typeof recipe.nutrition === 'string' ? JSON.parse(recipe.nutrition) : recipe.nutrition;
    nutrition = aiNut || regNut;
  } catch { /* skip */ }

  // ── INGREDIENT CHECKS ──
  if (ingredients.length > 15) {
    issues.push(`Too many ingredients: ${ingredients.length} (max 15)`);
  }
  if (ingredients.length === 0) {
    issues.push('No ingredients');
  }

  // Check for vague quantities
  for (const ing of ingredients) {
    const qty = ing.quantity || ing.qtySmall || '';
    const name = ing.name || '';
    const combined = `${qty} ${name}`;
    if (BANNED_PHRASES.test(combined)) {
      issues.push(`Vague quantity: "${combined.trim()}"`);
    }
  }

  // ── STEP CHECKS ──
  if (steps.length < 4) {
    warnings.push(`Few steps: ${steps.length} (recommended min 4)`);
  }
  if (steps.length > 8) {
    issues.push(`Too many steps: ${steps.length} (max 8)`);
  }

  // ── COOK TIME CHECKS ──
  const timeMinutes = recipe.time_minutes || 0;
  const difficulty = (recipe.difficulty || '').toLowerCase();
  // 60min+ is a valid category for slow-cook recipes (Hard difficulty)
  if (difficulty === 'easy' && timeMinutes > 35 && timeMinutes > 0) {
    warnings.push(`Easy recipe at ${timeMinutes}min (guideline: max 35)`);
  }
  if (difficulty === 'easy' && timeMinutes > 60) {
    issues.push(`Easy recipe exceeds 60 min: ${timeMinutes}min — should be Hard difficulty`);
  }

  // ── NUTRITION CHECKS ──
  if (nutrition) {
    // Calculate per-serving values
    // ai_nutrition stores batch totals (÷2.5), pipeline stores per-serving
    const isAiNutrition = !!recipe.ai_nutrition;
    const divisor = isAiNutrition ? 2.5 : 1;

    const proteinG = (nutrition.proteinG || nutrition.protein_g || nutrition.protein || 0) / divisor;
    const calories = (nutrition.calories || 0) / divisor;
    const mealType = recipe.meal_type || 'lunch_dinner';

    // Protein floors
    if (mealType === 'lunch_dinner' && proteinG < 25 && proteinG > 0) {
      issues.push(`Low protein for lunch/dinner: ${proteinG.toFixed(1)}g/serving (min 30g, allowing 25g grace)`);
    }
    if (mealType === 'breakfast' && proteinG < 12 && proteinG > 0) {
      issues.push(`Low protein for breakfast: ${proteinG.toFixed(1)}g/serving (min 15g, allowing 12g grace)`);
    }

    // Protein density
    if (calories > 0 && proteinG > 0) {
      const density = proteinG / calories * 100;
      if (density < 5.0) {
        issues.push(`Very low protein density: ${density.toFixed(1)}g/100cal (min 6.4, hard fail at 5.0)`);
      } else if (density < 6.4) {
        warnings.push(`Low protein density: ${density.toFixed(1)}g/100cal (target >= 6.4)`);
      }
    }

    // Calorie ceiling
    if (mealType === 'lunch_dinner' && calories > 800 && calories > 0) {
      issues.push(`High calories for lunch/dinner: ${calories.toFixed(0)} (max 700, allowing 800 grace)`);
    }
    if (mealType === 'breakfast' && calories > 600 && calories > 0) {
      issues.push(`High calories for breakfast: ${calories.toFixed(0)} (max 500, allowing 600 grace)`);
    }
    if (mealType === 'snack_dessert' && calories > 400 && calories > 0) {
      issues.push(`High calories for snack: ${calories.toFixed(0)} (max 350, allowing 400 grace)`);
    }
  } else {
    warnings.push('No nutrition data available');
  }

  // ── MISSING REQUIRED FIELDS ──
  if (!recipe.name || recipe.name.trim() === '') {
    issues.push('Missing recipe name');
  }
  if (!recipe.protein_id) {
    issues.push('Missing protein type');
  }

  // Score calculation
  const issueWeight = issues.length * 10;
  const warningWeight = warnings.length * 3;
  const score = Math.max(0, 100 - issueWeight - warningWeight);
  const approved = issues.length <= 1 && score >= 60; // Allow 1 issue with grace

  return { approved, score, issues, warnings };
}

// ════════════════════════════════════════
// MAIN
// ════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  SpiceStrong Recipe Quality Audit');
  console.log(`  Mode: ${isDryRun ? '🔍 DRY RUN (report only)' : '🗑️  DELETE MODE (will deactivate failures)'}`);
  console.log('═══════════════════════════════════════\n');

  // Fetch all active recipes
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch recipes:', error.message);
    process.exit(1);
  }

  console.log(`Found ${recipes.length} active recipes\n`);

  const passed = [];
  const failed = [];
  const warned = [];

  for (const recipe of recipes) {
    const result = validateRecipe(recipe);
    const status = result.approved ? '✅' : '❌';

    if (!result.approved) {
      failed.push({ recipe, result });
    } else if (result.warnings.length > 0) {
      warned.push({ recipe, result });
      passed.push({ recipe, result });
    } else {
      passed.push({ recipe, result });
    }

    // Print each recipe
    console.log(`${status} [${result.score}/100] ${recipe.name} (${recipe.protein_id})`);
    if (result.issues.length > 0) {
      result.issues.forEach(i => console.log(`   ❌ ${i}`));
    }
    if (result.warnings.length > 0) {
      result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('  AUDIT SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  ✅ Passed:  ${passed.length}`);
  console.log(`  ⚠️  Warnings: ${warned.length}`);
  console.log(`  ❌ Failed:  ${failed.length}`);
  console.log(`  📊 Total:   ${recipes.length}`);
  console.log('═══════════════════════════════════════\n');

  if (failed.length > 0) {
    console.log('FAILED RECIPES:');
    failed.forEach(({ recipe, result }) => {
      console.log(`  ❌ ${recipe.name} (${recipe.id})`);
      result.issues.forEach(i => console.log(`     → ${i}`));
    });
    console.log('');
  }

  // Deactivate if --delete flag
  if (!isDryRun && failed.length > 0) {
    console.log(`\n🗑️  Deactivating ${failed.length} failing recipes...\n`);

    for (const { recipe } of failed) {
      const { error: updateError } = await supabase
        .from('recipes')
        .update({ is_active: false })
        .eq('id', recipe.id);

      if (updateError) {
        console.log(`   ❌ Failed to deactivate ${recipe.name}: ${updateError.message}`);
      } else {
        console.log(`   🗑️  Deactivated: ${recipe.name} (${recipe.id})`);
      }
    }

    console.log(`\n✅ Done! ${failed.length} recipes deactivated.`);
  } else if (isDryRun && failed.length > 0) {
    console.log(`\n💡 Run with --delete to deactivate ${failed.length} failing recipes:`);
    console.log(`   node scripts/audit-recipes.js --delete\n`);
  } else {
    console.log('🎉 All recipes pass quality criteria!\n');
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
