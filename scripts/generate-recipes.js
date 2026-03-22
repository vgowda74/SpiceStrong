#!/usr/bin/env node
/**
 * generate-recipes.js — SpiceStrong AI Recipe Generator
 *
 * Reads recipe prompts from an Excel file (1 column per row),
 * calls Claude API to generate a complete structured recipe,
 * then writes individual Excel files in the exact format
 * that onboard-recipes-v2.js expects.
 *
 * Usage:
 *   node scripts/generate-recipes.js                          # reads recipes/prompts/recipe_prompts.xlsx
 *   node scripts/generate-recipes.js --input=my_prompts.xlsx  # custom input file
 *   node scripts/generate-recipes.js --row=3                  # generate only row 3
 *   node scripts/generate-recipes.js --dry-run                # preview prompts, don't call Claude
 *
 * Output: recipes/input/<sanitized_name>.xlsx (one per recipe)
 *
 * @requires dotenv xlsx
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// ─── Config ───
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
const MODEL = 'claude-sonnet-4-20250514';
const OUTPUT_DIR = path.join(__dirname, '..', 'Recipes', 'input');
const DEFAULT_INPUT = path.join(__dirname, '..', 'Recipes', 'prompts', 'recipe_prompts.xlsx');

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY or EXPO_PUBLIC_ANTHROPIC_KEY in .env');
  process.exit(1);
}

// ─── Proteins we support ───
const VALID_PROTEINS = [
  'chicken', 'fish', 'lamb', 'goat', 'pork', 'beef',
  'prawns', 'eggs', 'paneer', 'tofu', 'soy', 'beans', 'milk', 'whey'
];

// ─── System prompt for Claude ───
const RECIPE_SYSTEM_PROMPT = `You are a professional chef and recipe developer for SpiceStrong, a high-protein Indian & global cooking app.

Given a recipe prompt/description, you must generate a COMPLETE, DETAILED recipe in JSON format.

IMPORTANT RULES:
1. Every ingredient MUST have a precise quantity (e.g., "1 tsp", "250 g", "2 tbsp", "1 medium"). NEVER use vague amounts.
2. Cooking steps should be detailed and actionable. Each step should list EXACTLY which ingredients are used in that step with their quantities mentioned in the description.
3. Nutrition values must be realistic and accurate per serving.
4. Steps should have 5-8 steps typically. Each step should be a single clear action.
5. The recipe MUST be high-protein and fitness-friendly where possible.
6. Provide both "2-3 servings" and "4-6 servings" quantities.
7. Each step's ingredientsUsed field should list ONLY the ingredient names (not quantities) used in that specific step, comma-separated.

RECIPE NAMING CONVENTION:
- Recipe names should be descriptive and include the protein + cooking style
- Good examples: "High-Protein Paneer Bhurji", "Air Fryer Tandoori Chicken Breast (Gym Version)", "Indian Pepper Pork Fry", "High-Protein Pepper Shrimp"
- The recipe name MUST contain a word that clearly identifies the protein (e.g., "Chicken", "Paneer", "Shrimp", "Pork", "Egg", "Fish", "Lamb", "Tofu")
- This is critical because the app auto-detects the protein category from the recipe name

PROTEIN CATEGORY MAPPING — You MUST use EXACTLY one of these IDs for proteinType:
- "chicken" → for any chicken recipe (breast, thigh, drumstick, wings, ground chicken, etc.)
- "fish" → for any fish recipe (salmon, tuna, tilapia, cod, sardine, mackerel, etc.)
- "lamb" → for lamb/mutton recipes
- "goat" → for goat meat recipes
- "pork" → for pork recipes (pork loin, pork belly, ribs, bacon, ham, etc.)
- "beef" → for beef recipes (steak, ground beef, brisket, etc.)
- "prawns" → for shrimp, prawns, or any shellfish recipes. IMPORTANT: use "prawns" even for shrimp recipes
- "eggs" → for egg-based recipes (omelette, bhurji, frittata, etc.)
- "paneer" → for paneer OR cottage cheese recipes
- "tofu" → for tofu recipes
- "soy" → for soy chunk/soy granule recipes (NOT tofu — tofu has its own category)
- "beans" → for any beans, lentils, dal, chickpea, or legume recipes
- "milk" → for dairy-based recipes (yogurt bowls, lassi, smoothies with dairy as main protein)
- "whey" → for protein powder/supplement-based recipes (smoothies with whey, protein bars, etc.)

IMPORTANT: If the prompt mentions "shrimp", set proteinType to "prawns" (not "shrimp").
If the prompt mentions "dal" or "lentils" or "chickpeas", set proteinType to "beans".
If the prompt mentions "cottage cheese", set proteinType to "paneer".
The recipe name should use the common name (e.g., "Shrimp" is fine in the name), but proteinType MUST be the exact ID from the list above.

Return ONLY valid JSON with this exact structure:
{
  "recipeName": "string — full recipe name, must include the protein name for auto-detection",
  "description": "string — 1-2 sentence appetizing description",
  "cuisine": "string — e.g., 'Indian / South Indian', 'Indian / North Indian', 'Asian / Thai', 'Mediterranean'",
  "mealType": "string — one of: breakfast, lunch, dinner, lunch/dinner, snack, dessert, snack/dessert",
  "proteinType": "string — MUST be one of: chicken, fish, lamb, goat, pork, beef, prawns, eggs, paneer, tofu, soy, beans, milk, whey",
  "difficulty": "string — one of: Beginner, Intermediate, Advanced, Chef level",
  "spiceLevel": "string — one of: Low, Medium, High",
  "cookingTime": "number — total minutes",
  "servings": "number — base servings (usually 2 or 3)",
  "highProtein": "Yes or No",
  "lowCarb": "Yes or No",
  "lowCholesterol": "Yes or No",
  "glutenFree": "Yes or No",
  "fitnessFriendly": "Yes or No",
  "ingredients": [
    {
      "name": "string — ingredient name with prep notes e.g., 'Chicken breast (boneless, cubed)'",
      "qtySmall": "string — quantity for 2-3 servings e.g., '400 g'",
      "qtyLarge": "string — quantity for 4-6 servings e.g., '800 g'"
    }
  ],
  "steps": [
    {
      "title": "string — short step title e.g., 'Marinate the Chicken'",
      "description": "string — detailed instructions mentioning exact quantities e.g., 'Add 1 tsp turmeric, 2 tbsp yogurt, and 1 tsp chili powder to the chicken pieces. Mix well.'",
      "ingredientsUsed": "string — comma-separated ingredient names used in this step e.g., 'Turmeric Powder, Yogurt, Chili Powder, Chicken breast'",
      "cookingMethod": "string — e.g., 'marinate', 'sauté', 'simmer', 'roast', 'grill', 'air fry', 'boil', 'steam', 'prep'",
      "timerMinutes": "number or null — cooking time for this step if applicable",
      "tip": "string or null — optional chef tip for this step"
    }
  ],
  "nutrition": {
    "calories": "number — per serving",
    "protein": "number — grams per serving",
    "fat": "number — grams per serving",
    "carbs": "number — grams per serving",
    "fiber": "number — grams per serving",
    "sugar": "number — grams per serving",
    "sodium": "number — mg per serving",
    "cholesterol": "number — mg per serving",
    "saturatedFat": "number — grams per serving",
    "iron": "number — mg per serving",
    "calcium": "number — mg per serving"
  }
}

CRITICAL: Return ONLY the JSON object. No markdown, no backticks, no explanation.`;

// ─── Claude API call ───
async function callClaude(userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: RECIPE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Strip any markdown wrapping just in case
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('  Failed to parse Claude response as JSON:');
    console.error('  Response:', text.substring(0, 500));
    throw new Error('Claude returned invalid JSON');
  }
}

// ─── Protein alias fixes (catch what Claude might return wrong) ───
const PROTEIN_ALIASES = {
  shrimp: 'prawns', prawn: 'prawns', shellfish: 'prawns', lobster: 'prawns', crab: 'prawns',
  lentil: 'beans', lentils: 'beans', dal: 'beans', daal: 'beans', chickpea: 'beans', chickpeas: 'beans', legume: 'beans', legumes: 'beans', rajma: 'beans',
  'cottage cheese': 'paneer', 'cottage_cheese': 'paneer',
  mutton: 'lamb',
  salmon: 'fish', tuna: 'fish', cod: 'fish', tilapia: 'fish', mackerel: 'fish', sardine: 'fish',
  'protein powder': 'whey', whey_protein: 'whey',
  yogurt: 'milk', dairy: 'milk', lassi: 'milk',
  'soy chunks': 'soy', 'soy granules': 'soy', 'meal maker': 'soy',
};

/**
 * Validate and fix the protein type returned by Claude.
 * Also checks that the recipe name contains a recognizable protein word.
 */
function validateProtein(recipe) {
  let pt = (recipe.proteinType || '').toLowerCase().trim();

  // Fix common aliases
  if (PROTEIN_ALIASES[pt]) pt = PROTEIN_ALIASES[pt];

  // Validate against allowed list
  if (!VALID_PROTEINS.includes(pt)) {
    // Try to detect from recipe name as fallback
    const nameLower = recipe.recipeName.toLowerCase();
    const detected = VALID_PROTEINS.find(p => nameLower.includes(p))
      || Object.entries(PROTEIN_ALIASES).find(([alias]) => nameLower.includes(alias))?.[1];

    if (detected) {
      console.warn(`  WARN: Fixed proteinType "${recipe.proteinType}" → "${detected}" (detected from recipe name)`);
      pt = detected;
    } else {
      console.warn(`  WARN: Unknown proteinType "${recipe.proteinType}" — onboard script will try auto-detect`);
      pt = '';
    }
  }

  // Check recipe name contains a protein keyword for auto-detection by onboard script
  const nameLower = recipe.recipeName.toLowerCase();
  const proteinKeywords = [
    'chicken', 'fish', 'salmon', 'tuna', 'cod', 'lamb', 'mutton', 'goat',
    'pork', 'beef', 'steak', 'prawn', 'shrimp', 'egg', 'paneer',
    'cottage cheese', 'tofu', 'soy', 'bean', 'lentil', 'dal', 'chickpea',
    'milk', 'yogurt', 'lassi', 'whey', 'protein powder'
  ];
  const hasProteinInName = proteinKeywords.some(kw => nameLower.includes(kw));
  if (!hasProteinInName) {
    console.warn(`  WARN: Recipe name "${recipe.recipeName}" does not contain a protein keyword — onboard script may fail to auto-detect protein.`);
  }

  recipe.proteinType = pt;
  return recipe;
}

// ─── Write recipe Excel ───
function writeRecipeExcel(recipe, outputPath) {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Recipe Info (key-value pairs) ---
  const infoData = [
    ['Field', 'Value'],
    ['Recipe Name', recipe.recipeName],
    ['Description', recipe.description || ''],
    ['Cuisine', recipe.cuisine || ''],
    ['Meal Type', recipe.mealType || 'lunch/dinner'],
    ['Protein Type', recipe.proteinType || ''],
    ['Difficulty', ({ 'beginner': 'Easy', 'intermediate': 'Medium', 'advanced': 'Hard', 'chef level': 'Hard' }[(recipe.difficulty || 'Medium').toLowerCase()]) || recipe.difficulty || 'Medium'],
    ['Spice Level', recipe.spiceLevel || 'Medium'],
    ['Cooking Time', recipe.cookingTime || ''],
    ['Servings', recipe.servings || 2],
    ['High Protein', recipe.highProtein || 'No'],
    ['Low Carb', recipe.lowCarb || 'No'],
    ['Low Cholesterol', recipe.lowCholesterol || 'No'],
    ['Gluten Free', recipe.glutenFree || 'No'],
    ['Fitness Friendly', recipe.fitnessFriendly || 'No'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  // Set column widths
  wsInfo['!cols'] = [{ wch: 20 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Recipe Info');

  // --- Sheet 2: Ingredients ---
  const ingredientRows = [['#', 'Ingredient', 'Qty (2-3 servings)', 'Qty (4-6 servings)']];
  (recipe.ingredients || []).forEach((ing, i) => {
    ingredientRows.push([i + 1, ing.name, ing.qtySmall || '', ing.qtyLarge || '']);
  });
  const wsIng = XLSX.utils.aoa_to_sheet(ingredientRows);
  wsIng['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsIng, 'Ingredients');

  // --- Sheet 3: Cooking Steps (v2 format with Ingredients Used + Cooking Method) ---
  const stepRows = [['Step #', 'Step Title', 'Instructions', 'Ingredients Used in Step', 'Cooking Method', 'Timer', 'Chef Tip']];
  (recipe.steps || []).forEach((step, i) => {
    stepRows.push([
      i + 1,
      step.title || `Step ${i + 1}`,
      step.description || '',
      step.ingredientsUsed || '',
      step.cookingMethod || '',
      step.timerMinutes ? `${step.timerMinutes} min` : '',
      step.tip || '',
    ]);
  });
  const wsSteps = XLSX.utils.aoa_to_sheet(stepRows);
  wsSteps['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 60 }, { wch: 35 }, { wch: 15 }, { wch: 10 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSteps, 'Cooking Steps');

  // --- Sheet 4: Nutrition ---
  const nut = recipe.nutrition || {};
  const nutritionRows = [
    ['Nutrient', 'Per Serving'],
    ['Calories', nut.calories ? `${nut.calories} kcal` : ''],
    ['Protein', nut.protein ? `${nut.protein} g` : ''],
    ['Fat', nut.fat ? `${nut.fat} g` : ''],
    ['Carbohydrates', nut.carbs ? `${nut.carbs} g` : ''],
    ['Fiber', nut.fiber ? `${nut.fiber} g` : ''],
    ['Sugar', nut.sugar ? `${nut.sugar} g` : ''],
    ['Sodium', nut.sodium ? `${nut.sodium} mg` : ''],
    ['Cholesterol', nut.cholesterol ? `${nut.cholesterol} mg` : ''],
    ['Saturated Fat', nut.saturatedFat ? `${nut.saturatedFat} g` : ''],
    ['Iron', nut.iron ? `${nut.iron} mg` : ''],
    ['Calcium', nut.calcium ? `${nut.calcium} mg` : ''],
  ];
  const wsNut = XLSX.utils.aoa_to_sheet(nutritionRows);
  wsNut['!cols'] = [{ wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsNut, 'Nutrition');

  XLSX.writeFile(wb, outputPath);
}

// ─── Read prompts from Excel ───
function readPrompts(inputPath) {
  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Prompts file not found: ${inputPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(inputPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const prompts = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const text = String(row[0]).trim();
    // Skip header row if it looks like one
    if (i === 0 && /^(prompt|recipe|description|#)/i.test(text)) continue;

    prompts.push({ row: i + 1, prompt: text });
  }

  return prompts;
}

// ─── Sanitize filename ───
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 60);
}

// ─── Main ───
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rowFilter = args.find(a => a.startsWith('--row='));
  const targetRow = rowFilter ? parseInt(rowFilter.split('=')[1]) : null;
  const inputArg = args.find(a => a.startsWith('--input='));
  const inputPath = inputArg
    ? path.resolve(inputArg.split('=')[1])
    : DEFAULT_INPUT;

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  SpiceStrong AI Recipe Generator                    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  if (dryRun) console.log('🔸 DRY RUN mode — will preview prompts only\n');

  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${OUTPUT_DIR}/\n`);

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Read prompts
  const prompts = readPrompts(inputPath);
  if (prompts.length === 0) {
    console.error('ERROR: No prompts found in the spreadsheet.');
    process.exit(1);
  }

  const filtered = targetRow
    ? prompts.filter(p => p.row === targetRow)
    : prompts;

  console.log(`Found ${prompts.length} prompt(s), processing ${filtered.length}\n`);

  let success = 0;
  let failures = 0;
  const generated = [];

  for (const { row, prompt } of filtered) {
    console.log(`══════════════════════════════════════════════════════`);
    console.log(`  Row ${row}: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`);
    console.log(`══════════════════════════════════════════════════════`);

    if (dryRun) {
      console.log(`  PROMPT → Claude: "${prompt}"\n`);
      success++;
      continue;
    }

    try {
      console.log(`  Calling Claude API...`);
      const recipe = await callClaude(prompt);

      // Validate required fields
      if (!recipe.recipeName) throw new Error('Claude returned recipe with no name');
      if (!recipe.ingredients?.length) throw new Error('Claude returned recipe with no ingredients');
      if (!recipe.steps?.length) throw new Error('Claude returned recipe with no steps');

      // Validate & fix protein type + check recipe name
      validateProtein(recipe);

      console.log(`  ✓ Recipe: ${recipe.recipeName}`);
      console.log(`    Protein: ${recipe.proteinType || '(auto-detect)'}`);
      console.log(`    Cuisine: ${recipe.cuisine}`);
      console.log(`    Ingredients: ${recipe.ingredients.length}`);
      console.log(`    Steps: ${recipe.steps.length}`);
      console.log(`    Calories: ${recipe.nutrition?.calories || 'N/A'} kcal`);
      console.log(`    Protein: ${recipe.nutrition?.protein || 'N/A'} g`);

      // Write Excel
      const filename = `${sanitizeFilename(recipe.recipeName)}.xlsx`;
      const outputPath = path.join(OUTPUT_DIR, filename);

      // Check if file already exists
      if (fs.existsSync(outputPath)) {
        console.warn(`  WARN: File already exists, overwriting: ${filename}`);
      }

      writeRecipeExcel(recipe, outputPath);
      console.log(`  ✓ Excel written: ${filename}`);

      // Show ingredient sample
      console.log(`  Sample ingredients:`);
      recipe.ingredients.slice(0, 4).forEach(ing => {
        console.log(`    - ${ing.name}: ${ing.qtySmall} / ${ing.qtyLarge}`);
      });

      // Show step sample
      console.log(`  Sample steps:`);
      recipe.steps.slice(0, 3).forEach((step, i) => {
        console.log(`    ${i + 1}. ${step.title}: ${step.description.substring(0, 80)}...`);
        console.log(`       Ingredients: ${step.ingredientsUsed || 'none listed'}`);
      });

      success++;
      generated.push({ row, name: recipe.recipeName, file: filename });
      console.log();

    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
      failures++;
    }

    // Small delay between API calls to be respectful
    if (filtered.indexOf(arguments[0]) < filtered.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ─── Summary ───
  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  GENERATION COMPLETE`);
  console.log(`══════════════════════════════════════════════════════`);
  console.log(`  Prompts processed: ${filtered.length}`);
  console.log(`  Recipes generated: ${success}`);
  console.log(`  Failures:          ${failures}`);

  if (generated.length > 0) {
    console.log(`\n  Generated files:`);
    generated.forEach(g => {
      console.log(`    ✓ Row ${g.row}: ${g.name} → ${g.file}`);
    });
    console.log(`\n  Next step: Run the onboarding script to load these recipes:`);
    console.log(`    node scripts/onboard-recipes-v2.js\n`);
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
