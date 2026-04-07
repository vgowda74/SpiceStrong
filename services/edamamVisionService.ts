/**
 * edamamVisionService.ts — SpiceStrong
 * Edamam Food Database Vision API integration.
 * Analyzes food images to get accurate nutrition from Edamam's verified database.
 *
 * Endpoint: POST /api/food-database/nutrients-from-image
 * Supports: base64 image upload or image URL
 * Returns: food items identified + full nutrition breakdown (160+ nutrients)
 */

const EDAMAM_FOOD_APP_ID = process.env.EXPO_PUBLIC_EDAMAM_FOOD_APP_ID;
const EDAMAM_FOOD_APP_KEY = process.env.EXPO_PUBLIC_EDAMAM_FOOD_APP_KEY;
const VISION_API_URL = 'https://api.edamam.com/api/food-database/nutrients-from-image';

export interface EdamamNutritionResult {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  cholesterolMg: number;
  saturatedFatG: number;
  foods: { label: string; quantity: string }[];
}

/**
 * Analyze a single food image using Edamam Vision API.
 * Returns nutrition data from Edamam's verified food database.
 */
export async function analyzeImageWithEdamam(base64: string): Promise<EdamamNutritionResult> {
  if (!EDAMAM_FOOD_APP_ID || !EDAMAM_FOOD_APP_KEY) {
    throw new Error('Edamam Food Database API keys not configured');
  }

  const url = `${VISION_API_URL}?app_id=${EDAMAM_FOOD_APP_ID}&app_key=${EDAMAM_FOOD_APP_KEY}&beta=true`;

  // Ensure base64 has the data URI prefix
  let imageData = base64;
  if (!imageData.startsWith('data:')) {
    // Detect format from header
    let mimeType = 'image/jpeg';
    if (imageData.startsWith('iVBOR')) mimeType = 'image/png';
    else if (imageData.startsWith('UklGR')) mimeType = 'image/webp';
    imageData = `data:${mimeType};base64,${imageData}`;
  }

  console.log(`[SpiceStrong] Edamam Vision: sending image (${Math.round(base64.length / 1024)}KB)`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageData }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[SpiceStrong] Edamam Vision error ${res.status}:`, errBody);
    throw new Error(`Edamam Vision API returned ${res.status}`);
  }

  const data = await res.json();
  console.log('[SpiceStrong] Edamam Vision raw response:', JSON.stringify(data).slice(0, 500));

  return parseEdamamResponse(data);
}

/**
 * Analyze multiple food images (one per item in the meal).
 * Calls Edamam Vision for each image and sums the nutrition.
 */
export async function analyzeMultipleImagesWithEdamam(
  base64Images: string[],
): Promise<EdamamNutritionResult> {
  if (base64Images.length === 0) throw new Error('No images to analyze');

  // Analyze each image in parallel (max 4)
  const results = await Promise.all(
    base64Images.map((b64) => analyzeImageWithEdamam(b64).catch((err) => {
      console.warn('[SpiceStrong] Edamam Vision single image failed:', err);
      return null;
    }))
  );

  // Sum all successful results
  const validResults = results.filter(Boolean) as EdamamNutritionResult[];
  if (validResults.length === 0) throw new Error('Could not analyze any images');

  const combined: EdamamNutritionResult = {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    cholesterolMg: 0,
    saturatedFatG: 0,
    foods: [],
  };

  for (const r of validResults) {
    combined.calories += r.calories;
    combined.proteinG += r.proteinG;
    combined.carbsG += r.carbsG;
    combined.fatG += r.fatG;
    combined.fiberG += r.fiberG;
    combined.sugarG += r.sugarG;
    combined.sodiumMg += r.sodiumMg;
    combined.cholesterolMg += r.cholesterolMg;
    combined.saturatedFatG += r.saturatedFatG;
    combined.foods.push(...r.foods);
  }

  // Round everything
  combined.calories = Math.round(combined.calories);
  combined.proteinG = Math.round(combined.proteinG * 10) / 10;
  combined.carbsG = Math.round(combined.carbsG * 10) / 10;
  combined.fatG = Math.round(combined.fatG * 10) / 10;
  combined.fiberG = Math.round(combined.fiberG * 10) / 10;
  combined.sugarG = Math.round(combined.sugarG * 10) / 10;
  combined.sodiumMg = Math.round(combined.sodiumMg);
  combined.cholesterolMg = Math.round(combined.cholesterolMg);
  combined.saturatedFatG = Math.round(combined.saturatedFatG * 10) / 10;

  console.log(`[SpiceStrong] Edamam Vision combined: ${combined.calories} cal, ${combined.proteinG}g P, ${combined.carbsG}g C, ${combined.fatG}g F from ${combined.foods.length} items`);

  return combined;
}

/**
 * Parse Edamam Vision API response into our nutrition format.
 */
function parseEdamamResponse(data: any): EdamamNutritionResult {
  const foods: { label: string; quantity: string }[] = [];

  // Extract identified foods
  if (data.parsed && Array.isArray(data.parsed)) {
    for (const item of data.parsed) {
      if (item.food?.label) {
        foods.push({
          label: item.food.label,
          quantity: item.quantity ? `${item.quantity} ${item.measure?.label || 'g'}` : '',
        });
      }
    }
  }

  // Extract nutrition from totalNutrients (Edamam's standard format)
  const nutrients = data.recipe?.totalNutrients || data.totalNutrients || {};

  const getVal = (key: string): number => {
    return nutrients[key]?.quantity || 0;
  };

  return {
    calories: Math.round(data.recipe?.calories || data.calories || getVal('ENERC_KCAL')),
    proteinG: getVal('PROCNT'),
    carbsG: getVal('CHOCDF'),
    fatG: getVal('FAT'),
    fiberG: getVal('FIBTG'),
    sugarG: getVal('SUGAR'),
    sodiumMg: getVal('NA'),
    cholesterolMg: getVal('CHOLE'),
    saturatedFatG: getVal('FASAT'),
    foods,
  };
}

/**
 * Check if Edamam Food Vision API is configured.
 */
export function isEdamamVisionAvailable(): boolean {
  return !!(EDAMAM_FOOD_APP_ID && EDAMAM_FOOD_APP_KEY);
}
