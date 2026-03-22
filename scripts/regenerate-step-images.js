#!/usr/bin/env node
/**
 * regenerate-step-images.js — SpiceStrong Step Image Regenerator
 *
 * Fetches existing recipes from Supabase and regenerates AI step images
 * using context-aware progressive prompts that:
 *   - Show exact ingredients with quantities for each step
 *   - Remember previous steps (accumulated cooking state)
 *   - Use correct cooking vessel and method
 *   - Describe realistic visual state (color, texture, doneness)
 *
 * Usage:
 *   node scripts/regenerate-step-images.js                  # All curated recipes
 *   node scripts/regenerate-step-images.js --recipe=<id>    # Single recipe by ID
 *   node scripts/regenerate-step-images.js --protein=chicken # All recipes for a protein
 *   node scripts/regenerate-step-images.js --dry-run         # Preview prompts only, no generation
 *   node scripts/regenerate-step-images.js --hero            # Also regenerate hero images
 *   node scripts/regenerate-step-images.js --skip-existing   # Skip steps that already have images
 *   node scripts/regenerate-step-images.js --classify        # Also run classification pipeline
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { fal } = require('@fal-ai/client');

// Optional: classification pipeline
let classifyRecipe, getNutrition;
try {
  classifyRecipe = require('./pipeline/classifyRecipe').classifyRecipe;
  getNutrition = require('./pipeline/getNutrition').getNutrition;
} catch {
  // Pipeline modules not available — classification flag won't work
}

// ─── Config ───
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Parse CLI args ───
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const regenHero = args.includes('--hero');
const skipExisting = args.includes('--skip-existing');
const doClassify = args.includes('--classify');
const recipeIdArg = args.find(a => a.startsWith('--recipe='))?.split('=')[1] || null;
const proteinArg = args.find(a => a.startsWith('--protein='))?.split('=')[1] || null;

// Difficulty mapping for classification
const DIFFICULTY_MAP = {
  'Beginner': 'Easy', 'Intermediate': 'Medium',
  'Advanced': 'Hard', 'Chef level': 'Hard',
};

// ─── AI Image Generation ───

async function generateImage(prompt) {
  const result = await fal.subscribe('fal-ai/nano-banana-2', {
    input: { prompt, image_size: 'square_hd' },
  });
  const imageUrl = result.data.images[0].url;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download generated image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Context-Aware Step Image Prompt Builder ───

/**
 * Build a context-aware, progressive prompt for AI step image generation.
 *
 * @param {string} recipeName - Full recipe name
 * @param {Object[]} allSteps - All cooking steps [{title, description, ingredientsUsed?, cookingMethod?}]
 * @param {number} stepIndex - Current step index (0-based)
 * @param {Object[]} ingredients - Ingredients list [{name, quantity}]
 * @param {string|null} cuisineType - Cuisine classification (e.g., "Indian", "Thai")
 * @returns {string} Detailed AI image generation prompt
 */
function buildStepImagePrompt(recipeName, allSteps, stepIndex, ingredients, cuisineType) {
  const currentStep = allSteps[stepIndex];
  const stepNum = stepIndex + 1;
  const totalSteps = allSteps.length;
  const stepDesc = currentStep.description || '';
  const stepTitle = currentStep.title || `Step ${stepNum}`;
  const cookingMethod = currentStep.cookingMethod || currentStep.cooking_method || null;
  const ingredientsUsed = currentStep.ingredientsUsed || currentStep.ingredients_used || null;

  // ── Detect the cooking vessel from step descriptions ──
  const allDescs = allSteps.slice(0, stepIndex + 1).map(s => (s.description || '').toLowerCase()).join(' ');
  let vessel = 'pan';
  if (allDescs.includes('pot') || allDescs.includes('pressure cook') || allDescs.includes('boil'))
    vessel = 'pot';
  else if (allDescs.includes('kadai') || allDescs.includes('karahi') || allDescs.includes('wok'))
    vessel = 'kadai (Indian wok)';
  else if (allDescs.includes('tawa') || allDescs.includes('griddle') || allDescs.includes('flat pan'))
    vessel = 'tawa (flat griddle)';
  else if (allDescs.includes('oven') || allDescs.includes('bake'))
    vessel = 'oven tray';
  else if (allDescs.includes('skillet'))
    vessel = 'cast iron skillet';
  else if (allDescs.includes('deep fry') || allDescs.includes('deep-fry'))
    vessel = 'deep frying pan with oil';

  // ── Build ingredient detail for this step (always with quantities) ──
  // Helper: find the full ingredient entry (with quantity) from the master list
  function findIngredientWithQty(ingNameRaw) {
    const target = ingNameRaw.toLowerCase().trim();
    const getName = (ing) => (ing.name || ing.ingredient_name || '').toLowerCase().trim();
    // Exact name match
    let match = ingredients.find(ing => getName(ing) === target);
    if (match) return match;
    // Partial match: list name contains the target or vice versa
    match = ingredients.find(ing => {
      const fullName = getName(ing);
      return fullName.includes(target) || target.includes(fullName.split('(')[0].trim());
    });
    if (match) return match;
    // Word-level match
    const targetWords = target.split(/\s+/).filter(w => w.length > 2);
    match = ingredients.find(ing => {
      const fullName = getName(ing);
      return targetWords.some(w => fullName.includes(w));
    });
    return match || null;
  }

  let stepIngredientDetail = '';
  if (ingredientsUsed) {
    // ingredientsUsed is a comma-separated string like "Onion, Tomato, Green chili"
    // Look up each one in the master ingredients list to get the full quantity
    const usedNames = ingredientsUsed.split(',').map(s => s.trim()).filter(Boolean);
    const resolved = usedNames.map(usedName => {
      const found = findIngredientWithQty(usedName);
      const fName = found ? (found.name || found.ingredient_name || usedName) : usedName;
      if (found && found.quantity) {
        return `${found.quantity} ${fName}`;
      }
      return usedName;
    });
    stepIngredientDetail = resolved.join(', ');
  } else {
    // Auto-match: find ingredients mentioned in the step description
    const descLower = stepDesc.toLowerCase();
    const matched = ingredients.filter(ing => {
      const ingName = (ing.name || ing.ingredient_name || '').toLowerCase();
      const words = ingName.split(/[\s()]/g).filter(w => w.length > 2);
      return words.some(w => descLower.includes(w));
    });
    if (matched.length > 0) {
      stepIngredientDetail = matched.map(ing => {
        const name = ing.name || ing.ingredient_name || '';
        return ing.quantity ? `${ing.quantity} ${name}` : name;
      }).join(', ');
    }
  }

  // ── Also handle flat string ingredients (pipeline format: "400g chicken breast") ──
  // If ingredients are flat strings, try to match words directly
  if (!stepIngredientDetail && ingredients.length > 0 && typeof ingredients[0] === 'string') {
    const descLower = stepDesc.toLowerCase();
    const matched = ingredients.filter(ingStr => {
      const words = ingStr.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !/^\d/.test(w));
      return words.some(w => descLower.includes(w));
    });
    if (matched.length > 0) {
      stepIngredientDetail = matched.join(', ');
    }
  }

  // ── Summarize what happened in previous steps ──
  let previousContext = '';
  if (stepIndex > 0) {
    const prevSummaries = [];
    for (let p = 0; p < stepIndex; p++) {
      const prev = allSteps[p];
      prevSummaries.push(prev.description || prev.title);
    }
    previousContext = `Previous steps already done: ${prevSummaries.join('; ')}. The ${vessel} already contains the result of these steps.`;
  }

  // ── Determine the visual state ──
  const descLower = stepDesc.toLowerCase();
  let visualState = '';
  if (descLower.includes('sear') || descLower.includes('brown'))
    visualState = 'showing golden-brown seared surface with caramelization';
  else if (descLower.includes('sauté') || descLower.includes('saute') || descLower.includes('fry'))
    visualState = 'showing sizzling ingredients with light oil sheen';
  else if (descLower.includes('boil'))
    visualState = 'showing bubbling liquid with steam rising';
  else if (descLower.includes('simmer') || descLower.includes('low heat'))
    visualState = 'showing gentle bubbles with rich sauce coating the ingredients';
  else if (descLower.includes('golden') || descLower.includes('translucent'))
    visualState = 'showing softened, golden translucent onions';
  else if (descLower.includes('marinate') || descLower.includes('coat') || descLower.includes('mix'))
    visualState = 'showing ingredients well-coated and mixed in a bowl';
  else if (descLower.includes('garnish') || descLower.includes('serve') || descLower.includes('plate'))
    visualState = 'beautifully plated with fresh garnish, ready to serve';
  else if (descLower.includes('chop') || descLower.includes('slice') || descLower.includes('dice') || descLower.includes('cut'))
    visualState = 'showing neatly cut ingredients on a wooden cutting board';
  else if (descLower.includes('roast') || descLower.includes('char') || descLower.includes('grill'))
    visualState = 'showing charred edges with smoky appearance';
  else if (descLower.includes('cover') || descLower.includes('steam'))
    visualState = 'with lid partially lifted showing steam escaping';
  else if (descLower.includes('temper') || descLower.includes('tadka') || descLower.includes('splutter'))
    visualState = 'showing seeds and spices crackling in hot oil';
  else if (descLower.includes('knead') || descLower.includes('dough'))
    visualState = 'showing smooth dough being shaped on a floured surface';
  else if (descLower.includes('blend') || descLower.includes('puree') || descLower.includes('grind'))
    visualState = 'showing smooth blended mixture with vibrant color';
  else if (descLower.includes('toast') || descLower.includes('dry roast'))
    visualState = 'showing aromatic toasted spices releasing fragrance';
  else if (descLower.includes('pour') || descLower.includes('add water') || descLower.includes('add stock'))
    visualState = 'showing liquid being poured into the vessel with a splash';

  // ── Determine cooking stage ──
  let stageHint = '';
  if (stepIndex === 0) {
    stageHint = 'This is the very first step — show a clean kitchen setup with fresh raw ingredients.';
  } else if (stepIndex === totalSteps - 1) {
    stageHint = 'This is the FINAL step — show the completed dish looking appetizing and restaurant-quality.';
  } else if (stepIndex <= 1) {
    stageHint = 'Early cooking stage — ingredients are still relatively fresh and just starting to cook.';
  } else if (stepIndex >= totalSteps - 2) {
    stageHint = 'Late cooking stage — the dish is nearly complete, colors are rich and deep.';
  }

  // ── Cuisine-specific styling ──
  const cuisineHint = cuisineType
    ? `authentic ${cuisineType} cuisine style`
    : 'authentic home cooking';

  // ── Assemble the full prompt ──
  const parts = [
    `Professional food photography, top-down close-up shot of step ${stepNum} of ${totalSteps} for "${recipeName}".`,
    `Step: "${stepTitle}" — ${stepDesc}`,
  ];

  if (stepIngredientDetail) {
    parts.push(`Ingredients being added in this step: ${stepIngredientDetail}.`);
  }
  if (previousContext) {
    parts.push(previousContext);
  }

  parts.push(`Cooking vessel: ${vessel}.`);

  if (cookingMethod) {
    parts.push(`Cooking method: ${cookingMethod}.`);
  }
  if (visualState) {
    parts.push(`Visual: ${visualState}.`);
  }
  if (stageHint) {
    parts.push(stageHint);
  }

  parts.push(
    `Warm kitchen lighting, shallow depth of field, ${cuisineHint}.`,
    'Realistic food textures — no plastic or artificial look. Magazine-quality photography.',
    'Show realistic quantities matching a home-cooked meal for 2-3 people.',
    'No text, no watermarks, no UI elements.'
  );

  return parts.join(' ');
}

/**
 * Build a context-aware hero image prompt.
 */
function buildHeroImagePrompt(recipeName, ingredients, cuisineType) {
  const topIngredients = ingredients.slice(0, 5).map(ing =>
    ing.quantity ? `${ing.quantity} ${ing.name || ing.ingredient_name}` : (ing.name || ing.ingredient_name)
  ).join(', ');
  const cuisineHint = cuisineType ? `authentic ${cuisineType}` : 'authentic';
  return `Professional food photography of "${recipeName}", ${cuisineHint} dish beautifully plated and ready to serve. Key ingredients visible: ${topIngredients}. Warm natural lighting, shallow depth of field, overhead angle, high protein healthy meal. Realistic food textures, home-cooked feel, magazine quality. No text, no watermarks.`;
}

// ─── Supabase Storage Operations ───

async function uploadImageBuffer(recipeId, buffer, imageType = 'hero', stepIndex = null) {
  const storageName = imageType === 'hero' ? 'hero.jpg' : `step_${stepIndex}.jpg`;
  const storagePath = `${recipeId}/${storageName}`;

  // Delete existing file first (upsert for storage)
  await supabase.storage.from('recipe-images').remove([storagePath]);

  const { error } = await supabase.storage
    .from('recipe-images')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(storagePath);
  return urlData.publicUrl;
}

async function upsertImageMetadata(recipeId, publicUrl, imageType = 'hero', stepIndex = null) {
  // Try to update first, then insert if no row exists
  const matchFilter = { recipe_id: recipeId, image_type: imageType, step_index: stepIndex };

  const { data: existing } = await supabase
    .from('recipe_images')
    .select('id')
    .match(matchFilter)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('recipe_images')
      .update({ storage_url: publicUrl })
      .eq('id', existing.id);
    if (error) throw new Error(`Image metadata update failed: ${error.message}`);
  } else {
    const { error } = await supabase
      .from('recipe_images')
      .insert({ recipe_id: recipeId, image_type: imageType, step_index: stepIndex, storage_url: publicUrl });
    if (error) throw new Error(`Image metadata insert failed: ${error.message}`);
  }
}

// ─── Extract ingredients from Supabase recipe data ───

/**
 * Extract a flat [{name, quantity}] array from a recipe's ingredients column.
 * Handles both tiered format and flat array format.
 */
function extractIngredients(ingredientsData) {
  if (!ingredientsData) return [];

  // Tiered format: { "2-3 servings": [{name, quantity}], "4-6 servings": [...] }
  if (typeof ingredientsData === 'object' && !Array.isArray(ingredientsData)) {
    // Try "2-3 servings" first, then first available tier
    const tier = ingredientsData['2-3 servings']
      || ingredientsData['4-6 servings']
      || Object.values(ingredientsData)[0];

    if (Array.isArray(tier)) {
      return tier.map(ing => ({
        name: ing.name || ing.ingredient_name || '',
        quantity: ing.quantity || '',
      })).filter(ing => ing.name);
    }
  }

  // Flat string array format (from pipeline): ["400g chicken breast", "2 tsp black pepper"]
  if (Array.isArray(ingredientsData)) {
    return ingredientsData.map(item => {
      if (typeof item === 'string') {
        return { name: item, quantity: '' };
      }
      return {
        name: item.name || item.ingredient_name || '',
        quantity: item.quantity || '',
      };
    }).filter(ing => ing.name);
  }

  return [];
}

/**
 * Extract flat ingredient strings for classification API.
 */
function extractFlatIngredientStrings(ingredients) {
  return ingredients.map(ing =>
    ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name
  );
}

// ─── Main Processing ───

async function processRecipe(recipe) {
  const { id, name, steps, ingredients: ingredientsData, cuisine_type } = recipe;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${name} (${id})`);
  console.log(`${'═'.repeat(50)}`);

  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    console.log('  ⚠ No steps found — skipping');
    return { status: 'skipped', reason: 'no steps' };
  }

  const ingredients = extractIngredients(ingredientsData);
  console.log(`  Steps: ${steps.length} | Ingredients: ${ingredients.length} | Cuisine: ${cuisine_type || 'unknown'}`);

  // ─── Optional: Run classification pipeline ───
  if (doClassify && classifyRecipe) {
    try {
      const flatIngredients = extractFlatIngredientStrings(ingredients);
      const flatInstructions = steps.map(s => s.description || '');

      if (flatIngredients.length > 0 && flatInstructions.length > 0) {
        console.log(`\n  Classifying recipe...`);

        let classificationData = null;
        let nutritionData = null;

        try {
          const promises = [classifyRecipe(name, flatIngredients, flatInstructions)];
          if (getNutrition) promises.push(getNutrition(flatIngredients, 2));
          const results = await Promise.all(promises);
          classificationData = results[0];
          nutritionData = results[1] || null;
        } catch (err) {
          console.warn(`  WARN: Classification/nutrition failed: ${err.message}`);
        }

        const pipelineUpdate = {};

        if (classificationData) {
          console.log(`  Classification: cuisine=${classificationData.cuisine_type}, spice=${classificationData.spice_level}`);
          Object.assign(pipelineUpdate, {
            cuisine_type: classificationData.cuisine_type,
            spice_level: classificationData.spice_level,
            difficulty: DIFFICULTY_MAP[classificationData.difficulty] || classificationData.difficulty,
            cook_time_bucket: classificationData.cook_time_bucket,
            meal_type_tags: classificationData.meal_type,
            dietary_tags: classificationData.dietary_tags,
            allergen_tags: classificationData.allergen_tags,
            cooking_method: classificationData.cooking_method,
            fitness_goal: classificationData.fitness_goal,
            storage_tags: classificationData.storage_tags,
          });
          // Update local cuisine_type for image prompts
          recipe.cuisine_type = classificationData.cuisine_type;
        }

        if (nutritionData) {
          console.log(`  Nutrition: ${nutritionData.calories} kcal, ${nutritionData.protein_g}g protein`);
          Object.assign(pipelineUpdate, {
            calories: nutritionData.calories,
            protein_g: nutritionData.protein_g,
            carbs_g: nutritionData.carbs_g,
            fat_g: nutritionData.fat_g,
            fiber_g: nutritionData.fiber_g,
          });
        }

        if (Object.keys(pipelineUpdate).length > 0 && !isDryRun) {
          const { error } = await supabase.from('recipes').update(pipelineUpdate).eq('id', id);
          if (error) {
            console.warn(`  WARN: Classification update failed: ${error.message}`);
          } else {
            console.log(`  ✅ Classification saved: ${Object.keys(pipelineUpdate).length} fields`);
          }
        }
      }
    } catch (err) {
      console.warn(`  WARN: Classification skipped: ${err.message}`);
    }
  }

  // ─── Get existing step images ───
  let existingImages = {};
  if (skipExisting) {
    const { data: imgData } = await supabase
      .from('recipe_images')
      .select('step_index')
      .eq('recipe_id', id)
      .eq('image_type', 'step');

    if (imgData) {
      for (const img of imgData) {
        if (img.step_index != null) existingImages[img.step_index] = true;
      }
    }
  }

  let generatedCount = 0;
  let skippedCount = 0;

  // ─── Regenerate hero image ───
  if (regenHero) {
    console.log(`\n  🖼️  Hero image:`);
    const heroPrompt = buildHeroImagePrompt(name, ingredients, recipe.cuisine_type);

    if (isDryRun) {
      console.log(`    PROMPT: ${heroPrompt.substring(0, 150)}...`);
    } else {
      try {
        console.log(`    Generating hero image...`);
        const buffer = await generateImage(heroPrompt);
        const publicUrl = await uploadImageBuffer(id, buffer, 'hero');
        await upsertImageMetadata(id, publicUrl, 'hero');
        console.log(`    ✅ Hero image uploaded: ${publicUrl.substring(0, 80)}...`);
        generatedCount++;
      } catch (err) {
        console.warn(`    ❌ Hero image failed: ${err.message}`);
      }
    }
  }

  // ─── Regenerate step images ───
  for (let s = 0; s < steps.length; s++) {
    const stepNum = s + 1;
    const step = steps[s];

    if (skipExisting && existingImages[s]) {
      console.log(`  Step ${stepNum}: ⏭ Already has image — skipping`);
      skippedCount++;
      continue;
    }

    const prompt = buildStepImagePrompt(name, steps, s, ingredients, recipe.cuisine_type);

    console.log(`\n  Step ${stepNum}/${steps.length}: ${step.title || step.description?.substring(0, 50) || ''}...`);

    if (isDryRun) {
      console.log(`    PROMPT: ${prompt.substring(0, 200)}...`);
      // Show matched ingredients
      const descLower = (step.description || '').toLowerCase();
      const matched = ingredients.filter(ing => {
        const ingName = (ing.name || '').toLowerCase();
        const words = ingName.split(/\s+/).filter(w => w.length > 2);
        return words.some(w => descLower.includes(w));
      });
      if (step.ingredientsUsed) {
        console.log(`    INGREDIENTS (from sheet): ${step.ingredientsUsed}`);
      } else if (matched.length > 0) {
        console.log(`    INGREDIENTS (auto-matched): ${matched.map(i => `${i.quantity} ${i.name}`).join(', ')}`);
      } else {
        console.log(`    INGREDIENTS: (none matched for this step)`);
      }
      generatedCount++;
    } else {
      try {
        const buffer = await generateImage(prompt);
        const publicUrl = await uploadImageBuffer(id, buffer, 'step', s);
        await upsertImageMetadata(id, publicUrl, 'step', s);
        console.log(`    ✅ Step ${stepNum} image uploaded`);
        generatedCount++;
      } catch (err) {
        console.warn(`    ❌ Step ${stepNum} image failed: ${err.message}`);
      }
    }
  }

  const action = isDryRun ? 'previewed' : 'generated';
  console.log(`\n  Done: ${generatedCount} images ${action}, ${skippedCount} skipped`);
  return { status: 'success', generated: generatedCount, skipped: skippedCount };
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  SpiceStrong Step Image Regenerator                 ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (isDryRun) console.log('🔸 DRY RUN mode — will preview prompts only, no images generated\n');
  if (regenHero) console.log('🖼️  Hero images will also be regenerated\n');
  if (skipExisting) console.log('⏭  Skipping steps that already have images\n');
  if (doClassify) console.log('🏷️  Classification pipeline will run for each recipe\n');

  // Build query
  let query = supabase
    .from('recipes')
    .select('id, name, protein_id, steps, ingredients, cuisine_type, cooking_method')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (recipeIdArg) {
    query = query.eq('id', recipeIdArg);
  } else if (proteinArg) {
    query = query.eq('protein_id', proteinArg);
  }

  const { data: recipes, error } = await query;

  if (error) {
    console.error(`ERROR: Failed to fetch recipes: ${error.message}`);
    process.exit(1);
  }

  if (!recipes || recipes.length === 0) {
    console.log('No recipes found matching criteria.');
    process.exit(0);
  }

  console.log(`Found ${recipes.length} recipe(s) to process:\n`);
  recipes.forEach(r => console.log(`  - ${r.name} (${r.id})`));

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const recipe of recipes) {
    try {
      const result = await processRecipe(recipe);
      if (result.status === 'success') {
        totalGenerated += result.generated;
        totalSkipped += result.skipped;
      } else {
        totalSkipped++;
      }
    } catch (err) {
      console.error(`\n  ❌ FAILED: ${recipe.name} — ${err.message}`);
      totalFailed++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  REGENERATION COMPLETE`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`  Recipes processed:  ${recipes.length}`);
  console.log(`  Images ${isDryRun ? 'previewed' : 'generated'}:  ${totalGenerated}`);
  console.log(`  Steps skipped:      ${totalSkipped}`);
  console.log(`  Failures:           ${totalFailed}`);
  console.log();

  if (totalFailed > 0) process.exit(1);
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
