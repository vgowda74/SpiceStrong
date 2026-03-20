/**
 * recipeFingerprint.ts — SpiceStrong
 *
 * Generates a deterministic SHA-256 fingerprint hash for recipe deduplication.
 * The fingerprint is based on normalized ingredient names + step count,
 * ensuring that duplicate recipes (same ingredients, same complexity)
 * are detected regardless of formatting, quantity, or naming variations.
 *
 * Fingerprint formula:
 *   SHA-256( sorted_ingredient_names.join('|') + '|' + step_count )
 *
 * Design decisions:
 *   - Ingredient names are lowercased, trimmed, and sorted alphabetically
 *   - Quantities/units are stripped — only the core ingredient name matters
 *   - Step count (not step text) is included to differentiate simple vs complex versions
 *   - Handles both { name: "..." } and { ingredient_name: "..." } data shapes
 *   - Handles tiered ingredients ({ "2-3 servings": [...] }) by using the first tier
 */

import * as Crypto from 'expo-crypto';

/**
 * Shape of a single ingredient — supports both field naming conventions.
 */
interface IngredientItem {
  name?: string;
  ingredient_name?: string;
  quantity?: string;
}

/**
 * Tiered ingredient structure used in the app's recipe model.
 * e.g., { "2-3 servings": [...], "4-6 servings": [...] }
 */
type IngredientsByTier = Record<string, IngredientItem[]>;

/**
 * Recipe shape expected by the fingerprint generator.
 * Accepts both flat ingredient arrays and tiered objects.
 */
interface FingerprintableRecipe {
  ingredients: IngredientItem[] | IngredientsByTier;
  steps: unknown[];
}

/**
 * Extracts the ingredient name from an item, handling both data shapes.
 * Prefers `ingredient_name` over `name` when both exist.
 *
 * @param item - The ingredient object
 * @returns The normalized ingredient name, or empty string if not found
 */
function extractIngredientName(item: IngredientItem): string {
  const raw = item.ingredient_name || item.name || '';
  return raw.toLowerCase().trim();
}

/**
 * Resolves a flat array of ingredients from either a flat array
 * or a tiered IngredientsByTier object (uses the first tier found).
 *
 * @param ingredients - Flat array or tiered object
 * @returns Flat array of ingredient items
 */
function resolveIngredientArray(
  ingredients: IngredientItem[] | IngredientsByTier
): IngredientItem[] {
  // If it's already a flat array, return it
  if (Array.isArray(ingredients)) return ingredients;

  // It's a tiered object — use the first available tier
  // Prefer "2-3 servings" (base tier) if it exists
  const keys = Object.keys(ingredients);
  const baseTier = keys.find((k) => k.includes('2-3')) || keys[0];
  if (!baseTier) return [];

  const value = ingredients[baseTier];
  return Array.isArray(value) ? value : [];
}

/**
 * Generates a deterministic SHA-256 fingerprint for a recipe.
 *
 * The fingerprint is computed from:
 *   1. Sorted, normalized ingredient names (lowercase, trimmed, deduped)
 *   2. Total number of cooking steps
 *
 * This ensures two recipes with the same ingredients and same number
 * of steps will always produce the same fingerprint, regardless of:
 *   - Ingredient ordering in the source data
 *   - Quantity/unit differences
 *   - Whitespace or capitalization variations
 *   - Whether ingredients use `name` or `ingredient_name` key
 *
 * @param recipe - The recipe to fingerprint (needs ingredients + steps)
 * @returns Hex-encoded SHA-256 hash string
 *
 * @example
 * ```ts
 * const fp = await generateRecipeFingerprint({
 *   ingredients: { "2-3 servings": [{ name: "Chicken", quantity: "500g" }] },
 *   steps: [{ title: "Marinate", description: "..." }]
 * });
 * // Returns: "a1b2c3d4e5f6..." (64-char hex string)
 * ```
 */
export async function generateRecipeFingerprint(
  recipe: FingerprintableRecipe
): Promise<string> {
  // 1. Resolve ingredients to a flat array
  const items = resolveIngredientArray(recipe.ingredients);

  // 2. Extract, normalize, dedupe, and sort ingredient names
  const names = items
    .map(extractIngredientName)
    .filter((n) => n.length > 0);

  const uniqueNames = [...new Set(names)].sort();

  // 3. Build the fingerprint input string
  const stepCount = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  const input = uniqueNames.join('|') + '|' + stepCount;

  // 4. Hash with SHA-256
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  );

  return hash;
}

/**
 * Synchronous version of the fingerprint input string (for debugging/logging).
 * Returns the raw string that would be hashed, NOT the hash itself.
 *
 * @param recipe - The recipe to inspect
 * @returns The pre-hash input string
 */
export function getFingerprintInput(recipe: FingerprintableRecipe): string {
  const items = resolveIngredientArray(recipe.ingredients);
  const names = items
    .map(extractIngredientName)
    .filter((n) => n.length > 0);
  const uniqueNames = [...new Set(names)].sort();
  const stepCount = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  return uniqueNames.join('|') + '|' + stepCount;
}
