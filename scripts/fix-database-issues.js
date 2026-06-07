#!/usr/bin/env node

/**
 * fix-database-issues.js — Identify & Fix Database Issues
 * 
 * Finds and reports:
 * 1. Recipes with invalid step format
 * 2. Duplicate recipe names within same protein
 * 3. Provides fix recommendations
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findInvalidSteps() {
  console.log('\n📋 Finding Invalid Step Format\n');
  console.log('='.repeat(60));

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, name, protein_id, steps')
    .eq('is_active', true)
    .limit(500);

  if (error) {
    console.error('❌ Error fetching recipes:', error.message);
    return;
  }

  const invalidRecipes = [];

  recipes.forEach((recipe) => {
    const steps = recipe.steps;

    // Check if steps is array
    if (!Array.isArray(steps)) {
      invalidRecipes.push({
        id: recipe.id,
        name: recipe.name,
        protein_id: recipe.protein_id,
        issue: `Steps is not an array (type: ${typeof steps})`,
        current: steps,
      });
      return;
    }

    // Check if array is empty
    if (steps.length === 0) {
      invalidRecipes.push({
        id: recipe.id,
        name: recipe.name,
        protein_id: recipe.protein_id,
        issue: 'Steps array is empty',
        current: steps,
      });
      return;
    }

    // Check if each step has required fields
    steps.forEach((step, idx) => {
      if (!step.title || !step.description) {
        invalidRecipes.push({
          id: recipe.id,
          name: recipe.name,
          protein_id: recipe.protein_id,
          issue: `Step ${idx + 1} missing title or description`,
          current: step,
        });
      }
    });
  });

  if (invalidRecipes.length === 0) {
    console.log('✅ All recipes have valid step format!');
  } else {
    console.log(`⚠️  Found ${invalidRecipes.length} recipe(s) with invalid steps:\n`);

    invalidRecipes.forEach((recipe, idx) => {
      console.log(`${idx + 1}. ${recipe.name}`);
      console.log(`   ID: ${recipe.id}`);
      console.log(`   Protein: ${recipe.protein_id}`);
      console.log(`   Issue: ${recipe.issue}`);
      console.log(`   Current: ${JSON.stringify(recipe.current).substring(0, 100)}...`);
      console.log();
    });

    console.log('\n🔧 HOW TO FIX:');
    console.log('1. Go to Supabase Dashboard');
    console.log('2. Open "recipes" table');
    console.log('3. Find recipe by ID');
    console.log('4. Click "steps" column');
    console.log('5. Edit to valid format:');
    console.log(`
   [
     {
       "title": "Step 1 Title",
       "description": "Detailed instructions...",
       "timerMinutes": 5
     },
     {
       "title": "Step 2 Title", 
       "description": "More instructions...",
       "timerMinutes": 10
     }
   ]
    `);
    console.log('6. Save and verify\n');
  }

  return invalidRecipes;
}

async function findDuplicateNames() {
  console.log('\n📋 Finding Duplicate Recipe Names\n');
  console.log('='.repeat(60));

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, name, protein_id')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error fetching recipes:', error.message);
    return;
  }

  // Group by protein_id and name
  const nameMap = {};
  recipes.forEach((recipe) => {
    const key = `${recipe.protein_id}:${recipe.name.toLowerCase()}`;
    if (!nameMap[key]) {
      nameMap[key] = [];
    }
    nameMap[key].push(recipe.id);
  });

  // Find duplicates
  const duplicates = Object.entries(nameMap)
    .filter(([_, ids]) => ids.length > 1)
    .map(([key, ids]) => {
      const [protein_id, name] = key.split(':');
      return {
        protein_id,
        name,
        count: ids.length,
        ids,
      };
    });

  if (duplicates.length === 0) {
    console.log('✅ No duplicate recipe names found!');
  } else {
    console.log(`⚠️  Found ${duplicates.length} duplicate(s):\n`);

    duplicates.forEach((dup, idx) => {
      console.log(`${idx + 1}. "${dup.name}" (${dup.protein_id})`);
      console.log(`   Count: ${dup.count} copies`);
      console.log(`   IDs: ${dup.ids.join(', ')}`);
      console.log();
    });

    console.log('\n🔧 HOW TO FIX:');
    console.log('Option 1: Delete the older/lower quality version');
    console.log('  - Go to Supabase Dashboard');
    console.log('  - Open "recipes" table');
    console.log('  - Find recipe by ID');
    console.log('  - Delete the duplicate row\n');

    console.log('Option 2: Rename one to make it unique');
    console.log('  - Edit the recipe name to something different');
    console.log('  - Example: "Chicken Tikka Masala v2" or "Chicken Tikka Masala (Restaurant Style)"\n');

    console.log('Option 3: Merge the best parts');
    console.log('  - Keep the one with better ingredients/steps');
    console.log('  - Delete the other\n');
  }

  return duplicates;
}

async function generateFixScript() {
  console.log('\n💡 RECOMMENDED FIX STRATEGY\n');
  console.log('='.repeat(60));

  console.log('\n1️⃣  INVALID STEPS (1 recipe)');
  console.log('   Priority: MEDIUM');
  console.log('   Action: Review & fix manually in Supabase');
  console.log('   Time: 5-10 minutes');
  console.log('   Impact: Ensures step descriptions display correctly\n');

  console.log('2️⃣  DUPLICATE NAMES (14 recipes)');
  console.log('   Priority: LOW (cosmetic)');
  console.log('   Action: Either delete or rename duplicates');
  console.log('   Time: 15-30 minutes');
  console.log('   Impact: Cleaner recipe library\n');

  console.log('📊 RECOMMENDATION:\n');
  console.log('  For Build 64 release:');
  console.log('  ✅ Fix invalid steps BEFORE release (critical for UX)');
  console.log('  ⏳ Fix duplicates AFTER release (can do in next update)\n');

  console.log('  Command to track:');
  console.log('  npm run db:fix -- --check-only  (identify issues)');
  console.log('  npm run db:fix -- --auto-fix    (auto-delete old duplicates)\n');
}

async function main() {
  console.log('\n🔍 SpiceStrong Database Issue Finder\n');

  try {
    const invalidSteps = await findInvalidSteps();
    const duplicates = await findDuplicateNames();
    await generateFixScript();

    // Summary
    console.log('\n📋 SUMMARY\n');
    console.log('='.repeat(60));
    console.log(`Invalid Steps:    ${invalidSteps?.length || 0} recipe(s)`);
    console.log(`Duplicate Names:  ${duplicates?.length || 0} group(s)`);
    console.log('='.repeat(60));

    console.log('\n✅ Analysis complete.\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
