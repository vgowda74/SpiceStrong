#!/usr/bin/env node
/**
 * fix-recipe-accuracy.js — Uses Claude AI to fix ingredientsUsed fields
 * and descriptions for ALL recipes in Supabase.
 *
 * For each recipe:
 * 1. Sends the full ingredient list + steps to Claude
 * 2. Claude returns corrected ingredientsUsed for each step + improved description
 * 3. Updates the recipe in Supabase
 *
 * Usage:
 *   node scripts/fix-recipe-accuracy.js              # Dry run (show fixes, don't save)
 *   node scripts/fix-recipe-accuracy.js --apply       # Apply fixes to Supabase
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
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY or EXPO_PUBLIC_ANTHROPIC_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const shouldApply = process.argv.includes('--apply');

const FIX_SYSTEM_PROMPT = `You are a recipe accuracy editor for SpiceStrong, a high-protein fitness cooking app.

You will receive a recipe with its ingredient list and cooking steps. Your job is to:

1. FIX the "ingredientsUsed" field for EACH step so it ONLY lists ingredients that are actually used in that step's description.

2. FIX the step description to mention the QUANTITY of every ingredient used in that step.
   - If the step says "add ginger garlic paste" → change to "add 1 tbsp ginger garlic paste"
   - Look up the quantity from the ingredient list provided

3. FIX the description to be 1-2 sentences that mentions the protein name and approximate protein content.

RULES:
- ingredientsUsed must be a comma-separated string of ingredient names
- Use the BASE name from the ingredient list (e.g., "Chicken breast" not "Chicken breast (boneless, cubed)")
- Only list an ingredient in a step if that step's description actually uses it
- Every ingredient from the ingredient list must appear in exactly ONE step
- Do NOT change the step titles, cooking methods, timer values, or tips
- Do NOT change the ingredient list or quantities — only fix ingredientsUsed and step descriptions
- Keep step descriptions natural and clear — don't make them robotic

Return ONLY valid JSON with this structure:
{
  "description": "Fixed 1-2 sentence description mentioning protein and protein content",
  "steps": [
    {
      "stepIndex": 0,
      "ingredientsUsed": "Ingredient A, Ingredient B",
      "description": "Fixed step description with quantities mentioned"
    }
  ]
}

Return ONLY the JSON. No markdown, no explanation.`;

async function callClaude(userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: FIX_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

function parseIngredients(raw) {
  if (!raw) return [];
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(data)) {
    return data.map(i => typeof i === 'string' ? { name: i, quantity: '' } : i);
  }
  return data['2-3 servings'] || [];
}

function parseSteps(raw) {
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  SpiceStrong Recipe Accuracy Fixer');
  console.log(`  Mode: ${shouldApply ? '✅ APPLY (will update Supabase)' : '🔍 DRY RUN (preview only)'}`);
  console.log('═══════════════════════════════════════\n');

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

  let fixed = 0;
  let failed = 0;
  let skipped = 0;

  for (let r = 0; r < recipes.length; r++) {
    const recipe = recipes[r];
    const ingredients = parseIngredients(recipe.ingredients);
    const steps = parseSteps(recipe.steps);

    if (ingredients.length === 0 || steps.length === 0) {
      console.log(`⏭️  [${r + 1}/${recipes.length}] ${recipe.name} — no ingredients/steps, skipping`);
      skipped++;
      continue;
    }

    console.log(`🔧 [${r + 1}/${recipes.length}] Fixing: ${recipe.name}...`);

    // Build the prompt
    const ingredientList = ingredients
      .map(i => `- ${i.quantity || ''} ${i.name}`.trim())
      .join('\n');

    const stepList = steps
      .map((s, i) => `Step ${i + 1}: "${s.title}"
  Description: ${s.description}
  Current ingredientsUsed: ${s.ingredientsUsed || '(empty)'}
  Timer: ${s.timerMinutes ?? 'none'}min
  Cooking method: ${s.cookingMethod || 'not set'}`)
      .join('\n\n');

    const userMessage = `RECIPE: ${recipe.name}
Protein: ${recipe.protein_name} (${recipe.protein_id})
Current description: ${recipe.description || '(none)'}
Meal type: ${recipe.meal_type || 'lunch_dinner'}

INGREDIENT LIST (2-3 servings):
${ingredientList}

COOKING STEPS:
${stepList}

Fix the ingredientsUsed for each step and the description. Make sure every ingredient appears in exactly one step.`;

    try {
      const result = await callClaude(userMessage);

      // Preview changes
      if (result.description) {
        console.log(`  📝 Description: "${result.description}"`);
      }
      for (const stepFix of (result.steps || [])) {
        const idx = stepFix.stepIndex;
        const oldUsed = steps[idx]?.ingredientsUsed || '(empty)';
        const newUsed = stepFix.ingredientsUsed || '(empty)';
        if (oldUsed !== newUsed) {
          console.log(`  Step ${idx + 1}: ${oldUsed} → ${newUsed}`);
        }
      }

      // Apply if --apply
      if (shouldApply) {
        // Update steps
        const updatedSteps = [...steps];
        for (const stepFix of (result.steps || [])) {
          const idx = stepFix.stepIndex;
          if (updatedSteps[idx]) {
            updatedSteps[idx].ingredientsUsed = stepFix.ingredientsUsed;
            if (stepFix.description) {
              updatedSteps[idx].description = stepFix.description;
            }
          }
        }

        const updateData = {
          steps: updatedSteps,
        };
        if (result.description) {
          updateData.description = result.description;
        }

        const { error: updateError } = await supabase
          .from('recipes')
          .update(updateData)
          .eq('id', recipe.id);

        if (updateError) {
          console.log(`  ❌ Update failed: ${updateError.message}`);
          failed++;
        } else {
          console.log(`  ✅ Updated in Supabase`);
          fixed++;
        }
      } else {
        fixed++;
      }

      // Rate limit — wait 1 second between API calls
      await sleep(1000);
    } catch (err) {
      console.log(`  ❌ Claude error: ${err.message}`);
      failed++;
      await sleep(2000); // Wait longer on error
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  FIX SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  ✅ Fixed:   ${fixed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  📊 Total:   ${recipes.length}`);
  console.log('═══════════════════════════════════════');

  if (!shouldApply && fixed > 0) {
    console.log(`\n💡 Run with --apply to save fixes to Supabase:`);
    console.log(`   node scripts/fix-recipe-accuracy.js --apply\n`);
  }
}

main().catch(err => {
  console.error('Fix script failed:', err);
  process.exit(1);
});
