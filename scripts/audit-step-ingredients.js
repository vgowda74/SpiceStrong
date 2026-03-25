#!/usr/bin/env node
/**
 * audit-step-ingredients.js — Audits recipe descriptions and step-level
 * ingredientsUsed vs step description text for mismatches.
 *
 * Usage:
 *   node scripts/audit-step-ingredients.js
 *
 * Run from project root: cd C:\Users\v_gow\SpiceStrong
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════

/**
 * Normalize an ingredient name for fuzzy matching:
 * lowercase, strip hyphens, collapse whitespace, trim.
 */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy match: returns true if either string contains the other,
 * or if any single word (3+ chars) from `ingredient` appears in `text`.
 */
function fuzzyMatch(ingredient, text) {
  const normIng = normalize(ingredient);
  const normText = normalize(text);

  if (!normIng || !normText) return false;

  // Direct containment either way
  if (normText.includes(normIng) || normIng.includes(normText)) return true;

  // Check if any meaningful word from the ingredient appears in the text
  const words = normIng.split(' ').filter(w => w.length >= 3);
  return words.some(word => normText.includes(word));
}

/**
 * Common cooking ingredients to look for in step descriptions.
 * These are used to detect ingredients mentioned in text that might
 * not be listed in ingredientsUsed.
 */
const COMMON_INGREDIENTS = [
  'oil', 'olive oil', 'vegetable oil', 'coconut oil', 'sesame oil',
  'butter', 'ghee',
  'salt', 'pepper', 'black pepper',
  'onion', 'onions', 'garlic', 'ginger', 'ginger garlic paste',
  'tomato', 'tomatoes', 'tomato paste', 'tomato sauce',
  'cumin', 'turmeric', 'coriander', 'chili powder', 'red chili powder',
  'garam masala', 'paprika', 'cinnamon', 'cardamom', 'cloves',
  'curry leaves', 'bay leaf', 'bay leaves', 'mustard seeds',
  'chicken', 'chicken breast', 'chicken thigh', 'chicken thighs',
  'paneer', 'tofu', 'egg', 'eggs', 'prawns', 'shrimp', 'fish',
  'lamb', 'mutton', 'beef', 'pork',
  'rice', 'basmati rice', 'lentils', 'dal', 'chickpeas', 'beans',
  'yogurt', 'curd', 'cream', 'coconut milk', 'milk',
  'lemon', 'lemon juice', 'lime', 'lime juice', 'vinegar',
  'water', 'broth', 'stock', 'chicken stock',
  'cilantro', 'parsley', 'mint', 'basil',
  'sugar', 'honey', 'jaggery',
  'flour', 'besan', 'cornstarch',
  'soy sauce', 'fish sauce', 'sriracha',
  'bell pepper', 'capsicum', 'spinach', 'palak',
  'potato', 'potatoes', 'cauliflower', 'carrot', 'carrots',
  'peas', 'corn', 'mushroom', 'mushrooms',
  'cheese', 'mozzarella', 'parmesan',
  'cashews', 'almonds', 'peanuts',
];

/**
 * Find ingredient-like words mentioned in step description text
 * by checking against the known common ingredients list AND
 * against the recipe's own ingredient list.
 */
function findIngredientsInText(text, recipeIngredientNames) {
  const normText = normalize(text);
  const found = new Set();

  // Check common ingredients
  for (const ing of COMMON_INGREDIENTS) {
    const normIng = normalize(ing);
    if (normText.includes(normIng)) {
      found.add(ing);
    }
  }

  // Check recipe's own ingredients
  for (const ing of recipeIngredientNames) {
    const normIng = normalize(ing);
    if (!normIng) continue;
    // Check full name
    if (normText.includes(normIng)) {
      found.add(ing);
      continue;
    }
    // Check individual words (3+ chars)
    const words = normIng.split(' ').filter(w => w.length >= 3);
    for (const word of words) {
      if (normText.includes(word)) {
        found.add(ing);
        break;
      }
    }
  }

  return [...found];
}

// ════════════════════════════════════════
// DESCRIPTION QUALITY CHECK
// ════════════════════════════════════════

function checkDescription(recipe, proteinId) {
  const issues = [];
  const desc = (recipe.description || '').trim();

  if (!desc) {
    issues.push('Missing description');
    return issues;
  }

  // Count sentences (rough: split on . ! ?)
  const sentences = desc.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 3) {
    issues.push(`Description too long: ${sentences.length} sentences (target 1-2)`);
  }
  if (sentences.length === 0) {
    issues.push('Description appears empty after parsing');
  }

  // Check if protein is mentioned
  if (proteinId) {
    const proteinName = normalize(proteinId).replace(/_/g, ' ');
    const normDesc = normalize(desc);
    // Check protein name or common aliases
    const proteinWords = proteinName.split(' ').filter(w => w.length >= 3);
    const proteinMentioned = proteinWords.some(w => normDesc.includes(w));
    if (!proteinMentioned) {
      issues.push(`Description does not mention the protein "${proteinId}"`);
    }
  }

  return issues;
}

// ════════════════════════════════════════
// STEP INGREDIENT AUDIT
// ════════════════════════════════════════

function auditStepIngredients(steps, recipeIngredientNames) {
  const stepIssues = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNum = step.step || (i + 1);
    const stepDesc = step.description || step.instruction || '';
    const rawIngredientsUsed = step.ingredientsUsed || step.ingredients_used || '';

    // Parse ingredientsUsed (comma-separated string or array)
    let declaredIngredients = [];
    if (Array.isArray(rawIngredientsUsed)) {
      declaredIngredients = rawIngredientsUsed.map(s => s.trim()).filter(Boolean);
    } else if (typeof rawIngredientsUsed === 'string' && rawIngredientsUsed.trim()) {
      declaredIngredients = rawIngredientsUsed.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Find ingredients actually mentioned in description
    const foundInDesc = findIngredientsInText(stepDesc, recipeIngredientNames);

    // Check: declared ingredients NOT mentioned in description
    const declaredNotInDesc = declaredIngredients.filter(declared => {
      return !foundInDesc.some(found => fuzzyMatch(declared, found));
    });

    // Check: ingredients in description NOT declared
    const inDescNotDeclared = foundInDesc.filter(found => {
      return !declaredIngredients.some(declared => fuzzyMatch(declared, found));
    });

    // Check: empty ingredientsUsed but description mentions ingredients
    const emptyButHasIngredients = declaredIngredients.length === 0 && foundInDesc.length > 0;

    const hasIssues = declaredNotInDesc.length > 0 || inDescNotDeclared.length > 0 || emptyButHasIngredients;

    stepIssues.push({
      stepNum,
      title: step.title || '',
      description: stepDesc,
      declaredIngredients,
      foundInDesc,
      declaredNotInDesc,
      inDescNotDeclared,
      emptyButHasIngredients,
      hasIssues,
    });
  }

  return stepIssues;
}

// ════════════════════════════════════════
// MAIN
// ════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SpiceStrong Step-Ingredient Audit');
  console.log('  Mode: 🔍 DRY RUN (report only)');
  console.log('═══════════════════════════════════════════════════════\n');

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

  let recipesWithIssues = 0;
  let totalStepIssues = 0;
  let totalDescIssues = 0;

  for (const recipe of recipes) {
    // Parse ingredients
    let ingredientNames = [];
    try {
      const ingData = typeof recipe.ingredients === 'string'
        ? JSON.parse(recipe.ingredients)
        : recipe.ingredients;
      if (Array.isArray(ingData)) {
        ingredientNames = ingData.map(i => (typeof i === 'string' ? i : (i.name || '')));
      } else if (ingData && typeof ingData === 'object') {
        const tier = ingData['2-3 servings'] || ingData['4-6 servings'] || [];
        ingredientNames = tier.map(i => (typeof i === 'string' ? i : (i.name || '')));
      }
    } catch { /* skip */ }

    // Parse steps
    let steps = [];
    try {
      steps = typeof recipe.steps === 'string'
        ? JSON.parse(recipe.steps)
        : (recipe.steps || []);
    } catch { /* skip */ }

    // Check description quality
    const descIssues = checkDescription(recipe, recipe.protein_id);

    // Audit step ingredients
    const stepResults = auditStepIngredients(steps, ingredientNames);
    const stepsWithIssues = stepResults.filter(s => s.hasIssues);

    const hasAnyIssue = descIssues.length > 0 || stepsWithIssues.length > 0;
    if (hasAnyIssue) recipesWithIssues++;
    totalDescIssues += descIssues.length;
    totalStepIssues += stepsWithIssues.length;

    // Print recipe header
    const icon = hasAnyIssue ? '❌' : '✅';
    console.log(`${icon} ${recipe.name} (${recipe.protein_id || 'unknown'})`);

    // Description issues
    if (descIssues.length > 0) {
      console.log('   📝 Description Issues:');
      descIssues.forEach(d => console.log(`      ❌ ${d}`));
    }

    // Step details (only print steps with issues to keep output manageable)
    if (stepsWithIssues.length > 0) {
      console.log('   🔪 Step Issues:');
      for (const s of stepResults) {
        if (!s.hasIssues) continue;

        const titleStr = s.title ? ` — ${s.title}` : '';
        console.log(`      Step ${s.stepNum}${titleStr}:`);
        console.log(`         ingredientsUsed: [${s.declaredIngredients.join(', ') || '(empty)'}]`);
        console.log(`         found in text:   [${s.foundInDesc.join(', ') || '(none)'}]`);

        if (s.emptyButHasIngredients) {
          console.log(`         ❌ ingredientsUsed is EMPTY but description mentions: ${s.foundInDesc.join(', ')}`);
        }
        if (s.declaredNotInDesc.length > 0) {
          console.log(`         ❌ Declared but NOT in description: ${s.declaredNotInDesc.join(', ')}`);
        }
        if (s.inDescNotDeclared.length > 0) {
          console.log(`         ❌ In description but NOT declared: ${s.inDescNotDeclared.join(', ')}`);
        }
      }
    }

    if (hasAnyIssue) console.log('');
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  📊 Total recipes scanned:     ${recipes.length}`);
  console.log(`  ❌ Recipes with issues:        ${recipesWithIssues}`);
  console.log(`  ✅ Clean recipes:              ${recipes.length - recipesWithIssues}`);
  console.log(`  📝 Description issues found:   ${totalDescIssues}`);
  console.log(`  🔪 Steps with mismatches:      ${totalStepIssues}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
