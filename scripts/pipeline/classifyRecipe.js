/**
 * classifyRecipe.js — SpiceStrong Recipe Classification Engine
 *
 * Uses the Claude API (claude-sonnet-4-6) to auto-classify a recipe
 * across 10 dimensions: cuisine, spice, difficulty, cook time, meal type,
 * dietary tags, allergen tags, cooking method, fitness goal, and storage tags.
 *
 * @module classifyRecipe
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn('[classifyRecipe] WARNING: No ANTHROPIC_API_KEY or EXPO_PUBLIC_ANTHROPIC_KEY found in env');
}

/**
 * System prompt that instructs Claude to act as a recipe classification engine.
 * Strictly defines all allowed values for each field.
 */
const CLASSIFICATION_SYSTEM_PROMPT = `You are a recipe classification engine for SpiceStrong, a high-protein cooking app.

Given a recipe name, ingredients list, and cooking instructions, you must classify the recipe across 10 dimensions.

Return ONLY valid JSON — no preamble, no markdown backticks, no explanation. Just the raw JSON object.

The JSON must have this exact shape:
{
  "cuisine_type": string,
  "spice_level": string,
  "difficulty": string,
  "cook_time_bucket": string,
  "meal_type": string[],
  "dietary_tags": string[],
  "allergen_tags": string[],
  "cooking_method": string,
  "fitness_goal": string[],
  "storage_tags": string[]
}

ALLOWED VALUES for each field:

1. cuisine_type (pick exactly ONE):
   "Indian", "South Indian", "Korean", "Japanese", "Chinese",
   "Vietnamese", "Thai", "Filipino", "Mediterranean", "Italian", "Greek",
   "Lebanese", "Turkish", "American", "Mexican", "Brazilian", "AI Fusion"
   — If the recipe is clearly from a sub-region of India, prefer "South Indian" over generic "Indian".
   — Use "AI Fusion" only if the recipe blends cuisines in an unusual way.

2. spice_level (pick exactly ONE):
   "No spice", "Mild", "Medium", "Hot", "Extra hot"
   — Infer from chili types and quantities:
     * No chili/pepper = "No spice"
     * 1 green chili or mild spice = "Mild"
     * Black pepper, moderate chili = "Medium"
     * Multiple chilies, chili powder > 1 tsp = "Hot"
     * Whole dried chilies, ghost pepper, extra chili = "Extra hot"

3. difficulty (pick exactly ONE):
   "Beginner", "Intermediate", "Advanced", "Chef level"
   — Beginner: fewer than 5 steps, no special techniques
   — Intermediate: 5 to 10 steps, some technique required
   — Advanced: more than 10 steps or uses techniques like tempering, deglazing, marinating, emulsifying
   — Chef level: professional techniques, multiple components, precision timing

4. cook_time_bucket (pick exactly ONE):
   "Under 15 min", "15-30 min", "30-60 min", "1-2 hours", "2+ hours"
   — Estimate total time from instructions. Include prep + cook time.
   — Marination time counts. If it says "marinate 30 min", that's part of the total.

5. meal_type (pick 1-4 from this list):
   "Breakfast", "Lunch", "Dinner", "Snack", "Pre-workout", "Post-workout", "Meal prep", "Bulk cooking"
   Rules:
   — "Pre-workout": high carb + moderate protein, light on fat
   — "Post-workout": high protein + moderate carbs, low fat
   — "Meal prep": recipes that store well 3-5 days in fridge
   — "Bulk cooking": recipes easily scaled to 4+ servings

6. dietary_tags (pick ALL that apply — be conservative, infer from ingredients):
   "High protein", "Low fat", "Low carb", "Keto", "Low calorie", "Low cholesterol", "Low sodium", "Low sugar", "High fiber"
   Threshold rules:
   — "High protein": only tag if the recipe likely has >= 30g protein per serving
   — "High fiber": only tag if the recipe likely has >= 5g fiber per serving
   — "Low carb": only tag if the recipe likely has < 25g carbs per serving
   — "Keto": only tag if carbs are likely < 20g AND fat is the dominant macro
   — "Low fat": only tag if fat is likely < 10g per serving
   — "Low calorie": only tag if calories are likely < 400 per serving
   — "Low cholesterol": infer from absence of high-cholesterol ingredients (egg yolks, organ meats, full-fat dairy)
   — "Low sodium": infer from absence of high-sodium ingredients (soy sauce, processed meats, added salt beyond a pinch)
   — "Low sugar": infer from absence of added sugars, honey, syrups, sweet sauces

7. allergen_tags (pick ALL that apply — these are "free-from" labels):
   "Gluten free", "Dairy free", "Nut free", "Egg free", "Soy free", "Shellfish free", "Vegetarian", "Vegan", "Paleo", "Whole30"
   Rules:
   — "Gluten free": no wheat, flour, barley, rye, breadcrumbs, pasta
   — "Dairy free": no milk, cream, butter, cheese, yogurt, ghee
   — "Nut free": no almonds, cashews, peanuts, pistachios, walnuts or nut-based oils/butters
   — "Egg free": no eggs in any form
   — "Soy free": no soy sauce, tofu, edamame, soy milk
   — "Shellfish free": no shrimp, crab, lobster, prawns, scallops
   — "Vegetarian": no meat or seafood (paneer, eggs, dairy are fine)
   — "Vegan": no meat, seafood, dairy, eggs, or honey
   — "Paleo": no grains, legumes, dairy, refined sugar, processed foods
   — "Whole30": no grains, legumes, dairy, added sugar, alcohol, soy

8. cooking_method (pick exactly ONE primary method):
   "Grilled", "Baked", "Stovetop", "Air fryer", "Slow cooker", "Instant pot", "Steamed", "Stir-fried", "Raw / No cook", "Smoked", "Broiled", "Pan-seared"
   — Pick the PRIMARY cooking method used in the main cooking step.

9. fitness_goal (pick ALL that apply):
   "Muscle gain", "Fat loss", "Maintenance", "Endurance", "Recovery", "Weight loss", "Body recomp"
   — Infer from the macro profile:
     * High protein + low carb → "Fat loss", "Body recomp"
     * High protein + moderate carb → "Muscle gain"
     * High protein overall → "Muscle gain", "Recovery"
     * Balanced macros → "Maintenance"
     * High carb + moderate protein → "Endurance"
     * Low calorie + high protein → "Weight loss", "Fat loss"

10. storage_tags (pick ALL that apply, empty array if none):
    "Freezer friendly", "Fridge 3-5 days", "Make ahead", "Meal prep ready", "Kid friendly", "Office lunch"
    — Most cooked chicken/meat dishes are "Meal prep ready" and "Fridge 3-5 days".
    — Curries and stews are "Freezer friendly" and "Make ahead".
    — Simple, non-spicy dishes can be "Kid friendly".
    — Portable dishes that reheat well are "Office lunch".

IMPORTANT: Return ONLY the JSON object. No other text.`;

/**
 * Classifies a recipe using Claude API across 10 dimensions.
 *
 * @param {string} name - Recipe name
 * @param {string[]} ingredients - Array of ingredient strings with quantities
 * @param {string[]} instructions - Array of ordered instruction strings
 * @returns {Promise<Object>} Classification result with all 10 fields
 * @throws {Error} If Claude API call fails or response is not valid JSON
 *
 * @example
 * const tags = await classifyRecipe(
 *   "Pepper Chicken",
 *   ["400g chicken breast", "2 tsp black pepper"],
 *   ["Heat oil in pan", "Add chicken and sear"]
 * );
 */
async function classifyRecipe(name, ingredients, instructions) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Missing ANTHROPIC_API_KEY or EXPO_PUBLIC_ANTHROPIC_KEY in environment variables');
  }

  const userMessage = `Classify this recipe:

Recipe Name: ${name}

Ingredients:
${ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

Instructions:
${instructions.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;

  try {
    console.log('[classifyRecipe] Calling Claude API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    let rawText = data.content[0].text.trim();

    // Strip accidental markdown backticks if present
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    const result = JSON.parse(rawText);

    // Validate required fields exist
    const requiredFields = [
      'cuisine_type', 'spice_level', 'difficulty', 'cook_time_bucket',
      'meal_type', 'dietary_tags', 'allergen_tags', 'cooking_method',
      'fitness_goal', 'storage_tags',
    ];

    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new Error(`Missing required field in Claude response: "${field}"`);
      }
    }

    console.log('[classifyRecipe] Classification complete');
    return result;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`[classifyRecipe] Claude returned invalid JSON: ${err.message}`);
    }
    throw new Error(`[classifyRecipe] API call failed: ${err.message}`);
  }
}

module.exports = { classifyRecipe };
