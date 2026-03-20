/**
 * getNutrition.js — SpiceStrong Edamam Nutrition Analyzer
 *
 * Calls the Edamam Nutrition Analysis API to compute per-serving
 * nutrition values and derives macro tags for recipe filtering.
 *
 * API docs: https://developer.edamam.com/edamam-nutrition-api
 *
 * Required env vars: EDAMAM_APP_ID, EDAMAM_APP_KEY
 *
 * @module getNutrition
 */

const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID;
const EDAMAM_APP_KEY = process.env.EDAMAM_APP_KEY;

/**
 * Edamam Nutrition Analysis API endpoint (POST).
 */
const EDAMAM_API_URL = 'https://api.edamam.com/api/nutrition-details';

/**
 * Derives macro_tags array from per-serving nutrition values.
 *
 * Rules:
 *   - protein_g >= 40 → "40g+ protein"
 *   - protein_g >= 30 → "30g+ protein"
 *   - calories < 300 → "Under 300 cal"
 *   - calories < 500 → "Under 500 cal"
 *   - carbs_g < 20 → "Under 20g carbs"
 *   - fat_g < 10 → "Under 10g fat"
 *
 * @param {Object} nutrition - Per-serving nutrition values
 * @returns {string[]} Array of macro tag strings
 */
function deriveMacroTags({ calories, protein_g, carbs_g, fat_g }) {
  const tags = [];

  if (protein_g >= 40) tags.push('40g+ protein');
  else if (protein_g >= 30) tags.push('30g+ protein');

  if (calories < 300) tags.push('Under 300 cal');
  else if (calories < 500) tags.push('Under 500 cal');

  if (carbs_g < 20) tags.push('Under 20g carbs');
  if (fat_g < 10) tags.push('Under 10g fat');

  return tags;
}

/**
 * Calls the Edamam Nutrition Analysis API to get per-serving nutrition.
 *
 * @param {string[]} ingredients - Array of ingredient strings with quantities
 *   e.g. ["400g chicken breast", "2 tsp black pepper", "1 tbsp olive oil"]
 * @param {number} servings - Number of servings the recipe makes
 * @returns {Promise<Object>} Nutrition result:
 *   {
 *     calories: number,       // per serving, rounded
 *     protein_g: number,      // per serving, 1 decimal
 *     carbs_g: number,        // per serving, 1 decimal
 *     fat_g: number,          // per serving, 1 decimal
 *     fiber_g: number,        // per serving, 1 decimal
 *     macro_tags: string[]    // derived tags
 *   }
 * @throws {Error} If Edamam API call fails or returns an error
 */
async function getNutrition(ingredients, servings = 1) {
  if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
    throw new Error(
      'Missing EDAMAM_APP_ID or EDAMAM_APP_KEY in environment variables. ' +
      'Sign up at https://developer.edamam.com/ to get API keys.'
    );
  }

  if (!ingredients || ingredients.length === 0) {
    throw new Error('[getNutrition] Ingredients array is empty');
  }

  if (servings < 1) {
    throw new Error('[getNutrition] Servings must be >= 1');
  }

  const url = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_APP_KEY}`;

  const payload = {
    title: 'SpiceStrong Recipe',
    ingr: ingredients,
    yield: servings,
  };

  try {
    console.log('[getNutrition] Calling Edamam Nutrition API...');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Edamam API returned ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();

    // Edamam Basic tier returns nutrition per-ingredient inside ingredients[].parsed[].nutrients
    // We sum across all parsed ingredients to get the total batch values.
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    // Check if top-level totalNutrients exists (higher tier plans)
    if (data.totalNutrients && Object.keys(data.totalNutrients).length > 0) {
      totalCalories = data.calories || 0;
      totalProtein = data.totalNutrients.PROCNT?.quantity || 0;
      totalCarbs = data.totalNutrients.CHOCDF?.quantity || 0;
      totalFat = data.totalNutrients.FAT?.quantity || 0;
      totalFiber = data.totalNutrients.FIBTG?.quantity || 0;
    } else if (data.ingredients) {
      // Basic tier: sum nutrients from each parsed ingredient
      for (const ing of data.ingredients) {
        for (const parsed of (ing.parsed || [])) {
          const n = parsed.nutrients || {};
          totalCalories += n.ENERC_KCAL?.quantity || 0;
          totalProtein += n.PROCNT?.quantity || 0;
          totalCarbs += n.CHOCDF?.quantity || 0;
          totalFat += n.FAT?.quantity || 0;
          totalFiber += n.FIBTG?.quantity || 0;
        }
      }
    }

    // Per-serving values
    const perServing = {
      calories: Math.round(totalCalories / servings),
      protein_g: parseFloat((totalProtein / servings).toFixed(1)),
      carbs_g: parseFloat((totalCarbs / servings).toFixed(1)),
      fat_g: parseFloat((totalFat / servings).toFixed(1)),
      fiber_g: parseFloat((totalFiber / servings).toFixed(1)),
    };

    // Derive macro tags
    const macro_tags = deriveMacroTags(perServing);

    console.log('[getNutrition] Nutrition analysis complete (Edamam USDA data)');

    return {
      ...perServing,
      macro_tags,
    };
  } catch (err) {
    if (err.message.includes('Edamam API returned')) {
      throw err;
    }
    throw new Error(`[getNutrition] API call failed: ${err.message}`);
  }
}

module.exports = { getNutrition, deriveMacroTags };
