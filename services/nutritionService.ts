/**
 * nutritionService.ts — Client-side Edamam Nutrition API
 * Ported from scripts/pipeline/getNutrition.js for use in the React Native app.
 */

const EDAMAM_APP_ID = process.env.EXPO_PUBLIC_EDAMAM_APP_ID;
const EDAMAM_APP_KEY = process.env.EXPO_PUBLIC_EDAMAM_APP_KEY;
const EDAMAM_API_URL = 'https://api.edamam.com/api/nutrition-details';

export interface MealNutrition {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

/**
 * Cleans ingredient strings for Edamam parsing.
 * Same logic as scripts/pipeline/getNutrition.js cleanForEdamam().
 */
export function cleanForEdamam(ingredients: string[]): string[] {
  const SKIP_PATTERNS = /^(water|ice|salt to taste|salt$)/i;
  const PREP_PHRASES = /\s*\(([^)]*)\)\s*/g;
  const VAGUE_QTY = /\b(to taste|as needed|for garnish|for serving|optional|a pinch|a handful)\b/gi;
  const TRAILING_PREP = /\s*,?\s*(finely |roughly |thinly )?(chopped|sliced|diced|minced|crushed|grated|cubed|julienned|deveined|peeled|rinsed|soaked|drained)\s*$/gi;

  return ingredients
    .filter(ing => !SKIP_PATTERNS.test(ing.trim()))
    .map(ing => {
      let clean = ing
        .replace(PREP_PHRASES, ' ')
        .replace(VAGUE_QTY, '')
        .replace(TRAILING_PREP, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean || clean.length < 3) return null;
      return clean;
    })
    .filter(Boolean) as string[];
}

/**
 * Analyze nutrition for a list of ingredients via Edamam API.
 * Input format matches the app's { name, quantity } ingredient objects.
 * Returns nutrition per serving in the app's aiNutrition format.
 */
export async function analyzeNutrition(
  ingredients: { name: string; quantity: string }[],
  servings: number = 2.5,
): Promise<MealNutrition | null> {
  if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
    console.warn('[SpiceStrong] Missing Edamam API keys');
    return null;
  }

  if (!ingredients || ingredients.length === 0) return null;

  // Combine name + quantity into strings like "400g chicken breast"
  const rawStrings = ingredients.map(i => `${i.quantity} ${i.name}`.trim());
  const cleaned = cleanForEdamam(rawStrings);

  if (cleaned.length === 0) return null;

  const url = `${EDAMAM_API_URL}?app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_APP_KEY}`;

  try {
    console.log(`[SpiceStrong] Calling Edamam API with ${cleaned.length} ingredients:`, cleaned);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'SpiceStrong Recipe',
        ingr: cleaned,
        yield: servings,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[SpiceStrong] Edamam API returned ${response.status}: ${errorText}`);
      return null;
    }

    const data = await response.json();

    let totalCalories = 0, totalProtein = 0, totalCarbs = 0;
    let totalFat = 0, totalFiber = 0, totalSugar = 0, totalSodium = 0;

    // Higher-tier plan: top-level totalNutrients
    if (data.totalNutrients && Object.keys(data.totalNutrients).length > 0) {
      totalCalories = data.calories || 0;
      totalProtein = data.totalNutrients.PROCNT?.quantity || 0;
      totalCarbs = data.totalNutrients.CHOCDF?.quantity || 0;
      totalFat = data.totalNutrients.FAT?.quantity || 0;
      totalFiber = data.totalNutrients.FIBTG?.quantity || 0;
      totalSugar = data.totalNutrients.SUGAR?.quantity || 0;
      totalSodium = data.totalNutrients.NA?.quantity || 0;
    } else if (data.ingredients) {
      // Basic tier: sum from each parsed ingredient
      for (const ing of data.ingredients) {
        for (const parsed of (ing.parsed || [])) {
          const n = parsed.nutrients || {};
          totalCalories += n.ENERC_KCAL?.quantity || 0;
          totalProtein += n.PROCNT?.quantity || 0;
          totalCarbs += n.CHOCDF?.quantity || 0;
          totalFat += n.FAT?.quantity || 0;
          totalFiber += n.FIBTG?.quantity || 0;
          totalSugar += n.SUGAR?.quantity || 0;
          totalSodium += n.NA?.quantity || 0;
        }
      }
    }

    // Return BATCH totals (not per-serving) to match aiNutrition convention
    return {
      calories: Math.round(totalCalories),
      proteinG: parseFloat(totalProtein.toFixed(1)),
      carbsG: parseFloat(totalCarbs.toFixed(1)),
      fatG: parseFloat(totalFat.toFixed(1)),
      fiberG: parseFloat(totalFiber.toFixed(1)),
      sugarG: parseFloat(totalSugar.toFixed(1)),
      sodiumMg: Math.round(totalSodium),
    };
  } catch (err) {
    console.warn('[SpiceStrong] Edamam nutrition analysis failed:', err);
    return null;
  }
}
