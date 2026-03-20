/**
 * classifyRecipe.js — SpiceStrong Recipe Classification Engine
 *
 * Uses the Claude API (claude-sonnet-4-20250514) to auto-classify a recipe
 * across 10 dimensions: cuisine, spice, difficulty, cook time, meal type,
 * dietary tags, allergens, cooking method, fitness goal, and storage tags.
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
  "allergens": string[],
  "cooking_method": string,
  "fitness_goal": string[],
  "storage_tags": string[]
}

ALLOWED VALUES for each field:

1. cuisine_type (pick exactly ONE):
   "Indian", "South Indian", "North Indian", "Korean", "Japanese", "Chinese",
   "Vietnamese", "Thai", "Filipino", "Mediterranean", "Italian", "Greek",
   "Lebanese", "Turkish", "American", "Mexican", "Brazilian", "AI Fusion"
   — If the recipe is clearly from a sub-region of India, prefer "South Indian" or "North Indian" over generic "Indian".
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
   — Beginner: under 5 steps, simple techniques (boil, stir, fry)
   — Intermediate: 5-10 steps, moderate techniques
   — Advanced: 10+ steps or complex techniques (tempering, layering, marination)
   — Chef level: professional techniques (sous vide, emulsification, molecular)

4. cook_time_bucket (pick exactly ONE):
   "Under 15 min", "15-30 min", "30-60 min", "1-2 hours", "2+ hours"
   — Estimate total time from instructions. Include prep + cook time.
   — Marination time counts. If it says "marinate 30 min", that's part of the total.

5. meal_type (pick 1-3 from this list):
   "Breakfast", "Lunch", "Dinner", "Snack", "Post-workout", "Pre-workout"
   — High-protein meals are often "Post-workout". Include it if protein_type is meat/eggs/whey.
   — Light recipes can be "Snack". Most main courses are "Lunch" and "Dinner".

6. dietary_tags (pick ALL that apply):
   "High protein", "Low carb", "Low fat", "Keto friendly", "Gluten free",
   "Dairy free", "Nut free", "Vegan", "Vegetarian", "Pescatarian",
   "Paleo", "Whole30", "Sugar free", "Low sodium", "Heart healthy"
   — If main protein is chicken/fish/meat: NOT vegetarian/vegan.
   — If no wheat/flour/bread: "Gluten free".
   — If no dairy products: "Dairy free".
   — Always include "High protein" if the recipe has significant protein source.

7. allergens (pick ALL that apply, empty array if none):
   "Gluten", "Dairy", "Nuts", "Tree nuts", "Peanuts", "Eggs", "Soy",
   "Shellfish", "Fish", "Sesame"
   — Check ingredients carefully. Soy sauce = "Soy". Ghee/butter/cream/yogurt = "Dairy".
   — If no allergens detected, return empty array [].

8. cooking_method (pick exactly ONE primary method):
   "Stovetop", "Oven", "Air fryer", "Grill", "Slow cooker", "Pressure cooker",
   "Instant Pot", "No cook", "Microwave", "Steamer", "Deep fry", "Stir fry"
   — Pick the PRIMARY cooking method used in the main cooking step.

9. fitness_goal (pick ALL that apply):
   "Muscle gain", "Fat loss", "Lean bulk", "Maintenance", "Endurance fuel"
   — Infer from the macro profile:
     * High protein + low carb → "Fat loss", "Lean bulk"
     * High protein + moderate carb → "Muscle gain"
     * High protein overall → "Muscle gain"
     * Balanced macros → "Maintenance"
     * High carb + moderate protein → "Endurance fuel"

10. storage_tags (pick ALL that apply, empty array if none):
    "Meal prep ready", "Freezer friendly", "Next day tastes better",
    "Eat fresh only", "Keeps 3+ days"
    — Most cooked chicken/meat dishes are "Meal prep ready" and "Keeps 3+ days".
    — Curries and stews are "Freezer friendly" and "Next day tastes better".
    — Salads and fresh dishes are "Eat fresh only".

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
        model: 'claude-sonnet-4-20250514',
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
      'meal_type', 'dietary_tags', 'allergens', 'cooking_method',
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
